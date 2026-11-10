export type Block =
  | { t: "p"; text: string; center?: boolean; bold?: boolean; large?: boolean; italic?: boolean; bar?: boolean; caps?: boolean }
  | { t: "h"; text: string; large?: boolean }
  | { t: "scripture"; text: string; ref: string }
  | { t: "quote"; text: string; ref: string; center?: boolean; bar?: boolean }
  | { t: "list"; items: string[]; cols?: number; ordered?: boolean }
  | { t: "note"; text: string; standout?: boolean }
  | { t: "reveal"; text: string; center?: boolean }
  | { t: "trynow"; text: string }
  | { t: "field"; key: string; label: string; area: boolean; priority?: boolean; largeLabel?: boolean }
  | { t: "stemgroup"; area: string; keys: string[] }
  | { t: "iamcolumns"; heading?: string; columns: { statements: string[]; blanks: string[] }[] }
  | { t: "iamplus"; note: string; columns: { statements: string[] }[]; stems: { prefix: string; suffix?: string; key: string }[] }
  | { t: "myiam"; iamKeys: string[]; plusStems: { prefix: string; suffix?: string; key: string }[] }
  | { t: "gratjournal"; dateKey: string; keys: string[] }
  | { t: "blameown"; keys: string[][] }
  | { t: "noblame"; keys: string[][] }
  | { t: "complaingroup"; heading: string; notes: string[]; phrase?: string; keys: string[] }
  | { t: "prefergroup"; heading: string; notes: string[]; keys: string[][] }
  | { t: "influencechart"; rows: number }
  | { t: "evaltable"; keyPrefix: string; markHeader: string; context: string; rows: number }
  | { t: "reflect"; key: string; prompt: string }
  | { t: "check"; key: string; label: string }
  | { t: "cascade"; lines: string[] }
  | { t: "step"; title: string; bullets: { label?: string; text?: string; subs?: string[] }[] }
  | { t: "metaphorgrid"; title: string; cells: { label: string; text: string }[] }
  | { t: "group"; blocks: Block[] }
  | { t: "stepsbox"; items: string[] }
  | { t: "outline"; items: { level: 1 | 2 | 3; marker: string; text: string }[] }
  | { t: "mmtable"; distinction: string; milton: string; meta: string }
  | { t: "traitgrid"; items: { name: string; def: string }[] }
  | { t: "wordgrid"; title: string; words: string[] }
  | { t: "predicategrid"; sections: { name: string; columns: string[][] }[] }
  | { t: "eyecues"; entries: { code: string; name: string; text: string; dx: number; dy: number }[] }
  | { t: "eyechart" }
  | { t: "cartesgrid"; items: { q: string }[] }
  | { t: "special"; kind: "wheel" | "neuro" | "timer" | "ero" | "paretobar" | "commpie" | "selfconcept" | "vak" | "attention" | "tracking" | "planning" | "anchordiagram" | "triad" | "mustardseed" | "daygrid" | "morningchips" | "morningexample" | "morningbuilder" | "morningpicker" | "fear" | "envguide" | "envcircle" | "envgrid"; cats?: string[]; activities?: string[]; example?: { label: string; mins: string }[]; levels?: { name: string; talk: string; lead: string; body: string }[]; cues?: { name: string; eyes: string; voice: string; breathing: string; posture: string }[]; envs?: { name: string; items: string[] }[] };

export type Lesson = {
  id: string;
  num: number;
  group?: string;
  sectionHeader?: string;
  listSectionHeader?: string;
  title: string;
  dek?: string;
  blurb?: string;
  nlp?: boolean;
  funExtra?: boolean;
  centered?: boolean;
  blocks: Block[];
};

export type Module = {
  num: number;
  name: string;
  description: string;
  lessons: Lesson[];
};

// The Wheel of Life picker catalog (Tab 2, Lesson 3): the nineteen
// preset areas a student can pick from. The wheel exercise itself
// shows eight bars; the student fills them from this list plus up to
// three areas of their own. Areas whose names are unchanged from the
// old seven-area wheel keep their colors — and their saved ratings,
// which are keyed by these exact labels.
export const WHEEL_AREAS = [
  { label: "Career", color: "#7ed492" },
  { label: "Finance", color: "#e563d8" },
  { label: "Health", color: "#0f9b94" },
  { label: "Family", color: "#b18fd9" },
  { label: "Friends", color: "#f2a65a" },
  { label: "Romance", color: "#ef476f" },
  { label: "Free Time", color: "#2f7fe0" },
  { label: "Interests", color: "#805ad5" },
  { label: "Social Contribution", color: "#e02323" },
  { label: "Spiritual Life", color: "#9c6644" },
  { label: "Personal Growth", color: "#43aa8b" },
  { label: "Charitable Endeavors", color: "#bc4749" },
  { label: "Giving", color: "#f4845f" },
  { label: "Productivity", color: "#577590" },
  { label: "Lifestyle", color: "#d9a404" },
  { label: "Physical Environment", color: "#6a994e" },
  { label: "Creativity", color: "#7209b7" },
  { label: "Education & Learning", color: "#277da1" },
  { label: "Mental & Emotional Health", color: "#57707a" },
] as const;
