// Task categories. The stored value ("Coding") is what the server maps to a building line, so
// it never changes; what people see is the label. "Coding" covers any work or study.
export const TASK_CATEGORIES = ["Coding", "Fitness", "Finance"];

const LABELS = { Coding: "Work & Study" };

export function taskCategoryLabel(category) {
    return LABELS[category] || category;
}

// Starter ideas shown under the picker. Small, concrete and doable today: the point is to show
// up every day, not to be heroic once.
export const TASK_IDEAS = {
    Coding: {
        tip: "Any focused work or study counts.",
        ideas: ["Study for 25 minutes, phone away", "Read 20 pages", "Practise a skill for 30 minutes", "Clear the inbox", "Finish one small piece of the big project"],
    },
    Fitness: {
        tip: "New to exercise? Walk first, add a little each week. Three days a week is a great start. Stop if anything hurts.",
        ideas: [
            "Walk 20 minutes",
            "Stretch 10 minutes",
            "Squats, push-ups (knees are fine), 20 s plank: 3 rounds",
            "Jog 15 minutes, walk breaks allowed",
            "Take the stairs for 10 minutes",
            "Yoga or mobility, 15 minutes",
        ],
    },
    Finance: {
        tip: "Money tasks are actions. Use Quick log for what you spent.",
        ideas: ["Review this week's spending", "Cancel one subscription I don't use", "Set next week's food budget", "Compare one bill for a better price", "Move money into savings"],
    },
};
