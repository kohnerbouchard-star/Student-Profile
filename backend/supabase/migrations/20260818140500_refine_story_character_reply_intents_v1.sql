begin;

create or replace function private.classify_story_character_reply_intent_v1(p_body text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_body text := lower(btrim(coalesce(p_body, '')));
begin
  if v_body = '' then
    return 'statement';
  elsif v_body ~ '(thank you|thanks|thx|appreciate)' then
    return 'gratitude';
  elsif v_body ~ '(sorry|apolog|my fault)' then
    return 'apology';
  elsif v_body ~ '(shut up|idiot|stupid|hate you|useless)' then
    return 'hostile';
  elsif v_body ~ '(i disagree|do not agree|don''t agree|that is wrong|you are wrong)' then
    return 'disagreement';
  elsif v_body ~ '(worried|worry|concerned|concern|afraid|scared|risky|risk|problem)' then
    return 'concern';
  elsif v_body ~ '(should i|what would you|what do you think|recommend|advice|help me decide)' then
    return 'advice';
  elsif v_body ~ '(negotiate|negotiation|counteroffer|counter offer|bargain|walk-away|walk away|deal terms|contract terms)' then
    return 'negotiation';
  elsif position('?' in v_body) > 0
    or v_body ~ '^(what|why|how|when|where|who|can|could|would|should|do|does|is|are|will)[[:space:]]'
  then
    return 'question';
  elsif v_body ~ '^(hi|hello|hey|good morning|good afternoon|good evening)([[:punct:][:space:]]|$)' then
    return 'greeting';
  elsif v_body ~ '(i agree|sounds good|makes sense|okay|^ok([[:punct:][:space:]]|$)|i will|i''ll)' then
    return 'agreement';
  end if;
  return 'statement';
end;
$function$;

revoke all on function private.classify_story_character_reply_intent_v1(text)
  from public, anon, authenticated;

comment on function private.classify_story_character_reply_intent_v1(text) is
  'Bounded story-character reply intent classifier. Emotional concern and advice take precedence over negotiation; negotiation requires explicit deal-language.';

commit;
