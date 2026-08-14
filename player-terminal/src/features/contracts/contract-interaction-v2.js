const PUBLIC_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value, fallback = "") { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function token(value, fallback) {
  const candidate = text(value);
  return String(PUBLIC_TOKEN.test(candidate) ? candidate : fallback || "").toLowerCase();
}
function optionLabel(value) {
  if (typeof value === "string") return value.trim();
  const item = object(value);
  return text(item.label || item.text || item.title || item.value || item.name);
}

export function publicChoiceQuestions(metadata) {
  const materials = list(object(metadata).materials);
  const material = materials.find((entry) => text(object(entry).type).toLowerCase() === "quiz") || {};
  return list(object(material).questions).flatMap((questionValue, questionIndex) => {
    const question = object(questionValue);
    const prompt = text(question.prompt || question.question || question.title);
    const rawOptions = list(question.options || question.choices || question.answers);
    const options = rawOptions.map((optionValue, optionIndex) => {
      const option = object(optionValue);
      const label = optionLabel(optionValue);
      if (!label) return null;
      return {
        optionKey: token(option.optionKey || option.key || option.value, String.fromCharCode(65 + optionIndex)),
        label,
        detail: text(option.detail || option.description),
      };
    }).filter(Boolean);
    if (!prompt || options.length < 2) return [];
    return [{
      questionKey: token(question.questionKey || question.key, `q${questionIndex + 1}`),
      prompt,
      detail: text(question.detail || question.description),
      options,
    }];
  });
}

export function resolveContractInteraction(contract) {
  const metadata = object(contract.metadata);
  const questions = publicChoiceQuestions(metadata);
  if (questions.length) return { type: "multiple_choice", questions };
  const declared = text(metadata.interactionType || contract.completionMode).toLowerCase();
  if (/checklist/.test(declared)) return { type: "checklist", questions: [] };
  if (/decision|choice/.test(declared)) return { type: "decision", questions: [] };
  if (/link|url|evidence/.test(declared)) return { type: "evidence", questions: [] };
  return { type: "written", questions: [] };
}

export function publicSubmittedAnswers(evidence) {
  return list(object(evidence).answers).flatMap((answerValue) => {
    const answer = object(answerValue);
    const questionKey = text(answer.questionKey || answer.question);
    const optionKey = text(answer.optionKey || answer.option);
    return questionKey && optionKey ? [{ questionKey, optionKey }] : [];
  });
}
