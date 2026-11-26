import concurrent.futures, hashlib, json, pathlib, re, subprocess, sys

root = pathlib.Path(sys.argv[1])
blobs = root / "blobs/sha256"
blobs.mkdir(parents=True, exist_ok=True)
registry = "https://ghcr.io"
repo = "/v2/supabase/postgres"
index_id = "sha256:80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453"
platform_id = "sha256:b021e96054128399f84f24e39d29c21ee7c7169515e5d9e4e99ff15d5043d1d8"
config_id = "sha256:2d3ac69ad5c95d81458cc93a6cc6c31a98dfa00cd28f88a0a9358d315e1c357a"
curl = ["curl", "--silent", "--show-error", "--fail", "--location", "--connect-timeout", "10", "--proto", "=https"]
token_request = registry + "/token?service=ghcr.io&scope=repository:supabase/postgres:pull"
token = json.loads(subprocess.check_output(curl + ["--max-time", "25", token_request]))["token"]
assert re.fullmatch(r"[A-Za-z0-9_.=:+/-]+", token)
curl_auth = curl + ["--header", "Authorization: Bearer " + token]

def checked_bytes(path, digest, media):
    curl_call = curl_auth + ["--max-time", "35", "--header", "Accept: " + media, registry + repo + path]
    result = subprocess.run(curl_call, capture_output=True)
    assert result.returncode == 0, "PUBLIC_OCI_MANIFEST_UNAVAILABLE"
    b = result.stdout
    assert "sha256:" + hashlib.sha256(b).hexdigest() == digest, "OCI_MANIFEST_DIGEST"
    return b

index = json.loads(checked_bytes("/manifests/" + index_id, index_id, "application/vnd.oci.image.index.v1+json"))
descriptor, = [m for m in index["manifests"] if m.get("platform") == {"architecture":"amd64","os":"linux"}]
assert descriptor["digest"] == platform_id, "OCI_AMD64_DESCRIPTOR"
manifest = checked_bytes("/manifests/" + platform_id, platform_id, descriptor["mediaType"])
assert len(manifest) == descriptor["size"]
(blobs / platform_id[7:]).write_bytes(manifest)
image = json.loads(manifest)
assert image["config"]["digest"] == config_id, "OCI_CONFIG_DESCRIPTOR"

def verify_file(path, entry):
    if not path.exists() or path.stat().st_size != entry["size"]:
        return False
    with path.open("rb") as file:
        return "sha256:" + hashlib.file_digest(file, "sha256").hexdigest() == entry["digest"]

def download(entry):
    digest = entry["digest"]
    assert re.fullmatch(r"sha256:[0-9a-f]{64}", digest)
    path = blobs / digest[7:]
    if verify_file(path, entry):
        return
    temp = path.with_suffix(".partial")
    result = subprocess.run(curl_auth + ["--retry", "1", "--retry-max-time", "180", "--max-time", "180",
        "--output", str(temp), registry + repo + "/blobs/" + digest], capture_output=True)
    assert result.returncode == 0, "PUBLIC_OCI_BLOB_UNAVAILABLE"
    assert verify_file(temp, entry), "OCI_BLOB_DIGEST"
    temp.rename(path)

unique = {e["digest"]: e for e in [image["config"], *image["layers"]]}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for i, _ in enumerate(pool.map(download, unique.values()), 1):
        if i % 5 == 0:
            print("verified_layers", i, flush=True)
config = json.loads((blobs / config_id[7:]).read_bytes())
assert config["architecture"] == "amd64" and config["os"] == "linux"
descriptor["annotations"] = {"org.opencontainers.image.ref.name": "qualification"}
(root / "index.json").write_text(json.dumps({"schemaVersion": 2, "manifests": [descriptor]}))
(root / "oci-layout").write_text('{"imageLayoutVersion":"1.0.0"}')
print("OCI_AMD64_DIGESTS_VERIFIED", len(unique), flush=True)
