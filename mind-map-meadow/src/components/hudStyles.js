// The HUD's one visual language: cream parchment panels with a hard dark outline and a
// flat drop, the same outline colour the sprites use. No blur, no gradients, no glows.
export const PANEL_CLASS = "bg-[#f6e6c8] border-2 border-[#2b1e1a] rounded-sm shadow-[0_3px_0_#2b1e1a] text-[#2b1e1a]";

// Every HUD popover sits in the same slot beside the icon rail. Below lg it starts under
// the stats sign and stops above the bottom buttons, so nothing overlaps at phone width.
export const HUD_PANEL_CLASS = `absolute top-[72px] lg:top-6 right-[68px] lg:right-20 z-20 w-[calc(100vw-84px)] max-w-[300px] max-h-[calc(100dvh-13rem)] lg:max-h-[calc(100vh-8rem)] overflow-y-auto p-3 flex flex-col gap-3 select-text ${PANEL_CLASS}`;

export const PANEL_TITLE_CLASS = "font-pixel text-lg leading-none flex items-center gap-2 pb-2 border-b-2 border-[#cfa877]";

export const SECTION_TITLE_CLASS = "font-pixel text-sm leading-none";

export const COUNT_CHIP_CLASS = "font-pixel text-xs bg-[#2b1e1a] text-[#ffd65a] px-1.5 py-1 rounded-sm leading-none";

export const MUTED_TEXT_CLASS = "text-xs text-[#6b3f22]";

// One row of a list inside a panel: ruled like a ledger rather than a card inside a card.
export const ROW_CLASS = "flex items-center gap-2 py-2 border-b-2 border-[#e8c99a] last:border-b-0";

// Amber is the next step, emerald confirms, everything else stays muted.
const BTN_BASE =
    "inline-flex items-center justify-center gap-1.5 rounded-sm border-2 border-[#2b1e1a] font-bold text-xs leading-tight min-h-11 lg:min-h-8 px-3 py-1 shadow-[0_2px_0_#2b1e1a] transition-colors enabled:active:translate-y-[2px] enabled:active:shadow-none disabled:shadow-none disabled:cursor-not-allowed disabled:border-[#a5825a] disabled:bg-[#e8c99a]/50 disabled:text-[#6e5234] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f9a]";

const BTN_TONES = {
    next: "bg-[#e0a526] enabled:hover:bg-[#ffd65a] text-[#2b1e1a]",
    confirm: "bg-[#3f7a3a] enabled:hover:bg-[#5a9a4a] text-[#f4efe6]",
    muted: "bg-[#e8c99a] enabled:hover:bg-[#f4efe6] text-[#2b1e1a]",
    danger: "bg-[#e8c99a] enabled:hover:bg-[#f4efe6] text-[#9c2f2b]",
    pressed: "bg-[#cfa877] text-[#2b1e1a] translate-y-[2px] !shadow-none",
};

export function btn(tone = "muted", extra = "") {
    return `${BTN_BASE} ${BTN_TONES[tone] || BTN_TONES.muted} ${extra}`;
}

// Text-only actions (Skip guide, Log out). Still a full touch target on a phone.
export const LINK_BTN_CLASS = "inline-flex items-center min-h-11 lg:min-h-0 text-xs font-semibold text-[#6b3f22] hover:text-[#2b1e1a] underline underline-offset-2 transition-colors";

export const CLOSE_BTN_CLASS = "font-pixel shrink-0 w-11 h-11 lg:w-7 lg:h-7 -m-1 flex items-center justify-center text-lg leading-none text-[#6b3f22] hover:text-[#2b1e1a]";

// 16px below lg so a phone doesn't zoom the page when the field takes focus.
export const INPUT_CLASS =
    "w-full min-h-11 lg:min-h-9 px-2.5 py-1 rounded-sm border-2 border-[#6e5234] bg-[#f4efe6] text-[#2b1e1a] text-base lg:text-xs placeholder:text-[#8a6a45] focus:outline-none focus:border-[#2b1e1a] disabled:text-[#8a6a45]";

export const LABEL_CLASS = "text-xs font-semibold text-[#6b3f22]";

export const SEGMENT_GROUP_CLASS = "grid gap-1 p-1 rounded-sm bg-[#cfa877] border-2 border-[#2b1e1a]";

export function segment(active) {
    return `min-h-11 lg:min-h-7 px-1 rounded-sm text-xs font-bold transition-colors ${active ? "bg-[#f6e6c8] text-[#2b1e1a] shadow-[0_2px_0_#2b1e1a]" : "text-[#2b1e1a] hover:bg-[#e8c99a]"}`;
}

// A small tag on a row (Heritage, Paused).
export const TAG_CLASS = "text-xs font-bold px-1.5 py-0.5 rounded-sm leading-none";
