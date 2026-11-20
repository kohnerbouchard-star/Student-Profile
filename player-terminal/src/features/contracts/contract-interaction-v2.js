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

const STORY_DECISIONS = {
  "contract.meridian.compare-financing-governance.v1": {
    decisionKey: "meridian_model_recommendation",
    sceneTitle: "A Question of Priorities",
    speakerRole: "Sponsor",
    question: "Meridian cannot optimize for everything at once. If you had to choose the priority, where would you put the weight?",
    options: [
      ["finance_first", "Finance & investment", "Prioritize rapid capital formation and investment flexibility.", "You are putting a great deal of faith in capital moving faster than institutions.", "Why should financing take priority over governance, logistics, and industrial resilience?"],
      ["multilateral", "Multilateral governance", "Prioritize shared oversight, rules, and coordinated financing.", "You are choosing institutional coordination over speed.", "Why is shared governance worth the slower decisions and political friction it can create?"],
      ["trade_logistics", "Trade & logistics", "Prioritize customs capacity, transport, and supply-chain throughput.", "You are putting a great deal of weight on keeping goods, information, and people moving.", "Why should trade and logistics take priority over financing, governance, and industrial resilience?"],
      ["industrial_security", "Industrial security", "Prioritize strategic production capacity and infrastructure resilience.", "You are choosing resilience even when redundancy costs more.", "What makes the cost of industrial resilience worth accepting over faster growth or greater efficiency?"],
      ["hybrid", "A hybrid approach", "Combine elements of the competing models rather than making one dominant.", "A hybrid sounds safer until two priorities conflict and someone has to choose.", "When the goals conflict, what principle should decide which part of your hybrid model takes priority?"]
    ]
  },
  "contract.meridian.belonging-long-term-status-decision.v1": {
    decisionKey: "long_term_status_intent",
    sceneTitle: "What Comes After",
    speakerRole: "Sponsor",
    question: "The emergency will end eventually. When it does, what direction do you actually want your life here to take?",
    options: [
      ["remain_temporary", "Remain temporary", "Stay for now without making a permanent-status commitment.", "You are separating staying for now from promising that it will become permanent.", "Why is remaining temporary the right balance between your opportunities here and the commitments you are not ready to make?"],
      ["seek_permanent_residency", "Seek permanent residency", "Pursue a durable legal right to remain when eligible.", "That is a real commitment to building continuity here, even without assuming what the authorities will decide.", "Why do you want to make this country a durable part of your future rather than keeping your status temporary?"],
      ["seek_citizenship_if_eligible", "Seek citizenship if eligible", "Pursue citizenship if the legal system eventually makes that path available.", "That is the strongest long-term commitment you could intend, even though eligibility is not yours to grant.", "What makes citizenship, if you become eligible, worth the obligations and permanence it would represent?"],
      ["relocate", "Prepare to relocate", "Plan to build the next part of your life somewhere else.", "Then you are treating this chapter as important without treating it as permanent.", "What makes relocation a better long-term choice than deepening your commitments here?"],
      ["defer", "Defer the decision", "Do not commit to a long-term status direction yet.", "Keeping the option open protects flexibility, but it also postpones commitments other people may be planning around.", "What uncertainty is important enough that you are unwilling to choose a long-term direction yet?"]
    ]
  }
};

function storyDecisionInteraction(contract) {
  const contractKey = text(contract.contractKey || contract.publicKey || contract.key);
  const definition = STORY_DECISIONS[contractKey];
  if (!definition) return null;
  return {
    type: "story_decision",
    decisionKey: definition.decisionKey,
    sceneTitle: definition.sceneTitle,
    speakerRole: definition.speakerRole,
    question: definition.question,
    options: definition.options.map(([optionKey, label, detail, characterReaction, rationalePrompt]) => ({
      optionKey,
      label,
      detail,
      characterReaction,
      rationalePrompt
    }))
  };
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
  const storyDecision = storyDecisionInteraction(contract);
  if (storyDecision) return storyDecision;
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

export function publicSubmittedStoryDecision(evidence) {
  const storyDecision = object(object(evidence).storyDecision);
  const optionCandidate = text(storyDecision.optionKey);
  const optionKey = PUBLIC_TOKEN.test(optionCandidate) ? optionCandidate.toLowerCase() : "";
  const rationale = text(storyDecision.rationale);
  return optionKey && rationale ? { optionKey, rationale } : null;
}
