import type { Module } from "./types";
import { TAB0_LESSONS } from "./tab0";
import { TAB1_LESSONS } from "./tab1";
import { TAB2_LESSONS } from "./tab2";
import { TAB3_LESSONS } from "./tab3";
import { TAB4_LESSONS } from "./tab4";
import { TAB5_LESSONS } from "./tab5";
import { TAB6_LESSONS } from "./tab6";
import { TAB7_LESSONS } from "./tab7";
import { TAB8_LESSONS } from "./tab8";
import { TAB9_LESSONS } from "./tab9";
import { TAB10_LESSONS } from "./tab10";

export const MODULES: Module[] = [
  { num: 0, name: "Foundations", description: "Where everything starts: what you deserve, why things have to change, and the thinking that got you here — then an introduction to NLP, the conscious and subconscious mind, the levels of learning, the presuppositions, and the Thesis the whole program stands on.", lessons: TAB0_LESSONS },
  { num: 1, name: "Self-Concept & the Laws of Success", description: "The plan for the journey: self-concept and the reticular activating system, changing your beliefs, the laws of success, reframing, I AM statements, a code of conduct — and gratitude.", lessons: TAB1_LESSONS },
  { num: 2, name: "The Wheel of Life", description: "Take stock of your whole life with the Wheel of Life, see yourself clearly through the neurological levels — and a tid-bit on the reading habit of successful people.", lessons: TAB2_LESSONS },
  { num: 3, name: "Living Your Best Life", description: "The 80/20 rule and where your best life actually lives, then the art of rapport — building it, reading it, and leading with it.", lessons: TAB3_LESSONS },
  { num: 4, name: "Goal Setting", description: "Goal setting with teeth: the laws of achievement, the SMARTER goals worksheet, power questions, ecology checks, strategic planning, and tracking — because faith the size of a mustard seed moves mountains.", lessons: TAB4_LESSONS },
  { num: 5, name: "100% Responsibility", description: "Take 100% responsibility for your life and results. E + R = O, and a set of worksheets that root out blaming, complaining, and “have to” thinking.", lessons: TAB5_LESSONS },
  { num: 6, name: "Affirmations, Visualization & Anchoring", description: "The inner toolbox: the laws of self-fulfillment, affirmations and how to write them well, visualization, and anchoring — getting into the state you want, on cue.", lessons: TAB6_LESSONS },
  { num: 7, name: "Time & Productivity", description: "Learn from other successful people, manage your activity instead of your time, own your morning, and ask power questions at both ends of the day.", lessons: TAB7_LESSONS },
  { num: 8, name: "Fear and Follow Through and Clean Up", description: "Clear the ground: get organized, make fear your friend, lean into the first step, and clean up the messes and incompletes that quietly drain you.", lessons: TAB8_LESSONS },
  { num: 9, name: "Happiness & Action", description: "The laws of happiness, the 2-minute rule, and the discipline of taking action — a short tab with a long reach, and the checklist that pulls the whole program together.", lessons: TAB9_LESSONS },
  { num: 10, name: "Bonus Material", description: "The bonus stack: key success character traits, the seventeen principles of success, Cartesian questions, the three molders of meaning, and the New Behavior Generator.", lessons: TAB10_LESSONS },
];

export const ALL_LESSONS = MODULES.flatMap(m => m.lessons.map(l => ({ module: m, lesson: l })));
