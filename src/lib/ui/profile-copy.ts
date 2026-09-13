export const EXPLANATION_STYLES = [
  { value: "concise", label: "Concise", hint: "Short, high-signal wording" },
  { value: "structured", label: "Structured", hint: "Headings, order, and steps" },
  { value: "conversational", label: "Conversational", hint: "Plain spoken teaching" },
  { value: "socratic", label: "Socratic", hint: "Questions that lead you there" },
] as const;

export const DETAIL_PREFERENCES = [
  { value: "brief", label: "Brief", hint: "The core idea only" },
  { value: "standard", label: "Standard", hint: "Enough context to use it" },
  { value: "thorough", label: "Thorough", hint: "Full walkthroughs" },
] as const;

export const LEARNING_PREFERENCES = [
  { value: "text", label: "Text", hint: "Written explanation first" },
  {
    value: "diagram-descriptions",
    label: "Diagram descriptions",
    hint: "Describe figures in words",
  },
  {
    value: "worked-examples",
    label: "Worked examples",
    hint: "Show the method with numbers",
  },
] as const;

export const INTERESTS = [
  { value: "motorsports", label: "Motorsports" },
  { value: "music", label: "Music" },
  { value: "cooking", label: "Cooking" },
  { value: "sports", label: "Sports" },
  { value: "film", label: "Film" },
  { value: "nature", label: "Nature" },
  { value: "architecture", label: "Architecture" },
  { value: "gaming", label: "Gaming" },
  { value: "literature", label: "Literature" },
  { value: "travel", label: "Travel" },
] as const;
