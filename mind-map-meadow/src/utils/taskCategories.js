// Task categories. The stored value ("Coding") is what the server maps to a building line, so
// it never changes; what people see is the label. "Coding" covers any work or study.
export const TASK_CATEGORIES = ["Coding", "Fitness", "Finance"];

const LABELS = { Coding: "Work & Study" };

export function taskCategoryLabel(category) {
    return LABELS[category] || category;
}

// Starter ideas, one short row under the form while the title is empty. Small and doable today:
// the point is to show up every day, not to be heroic once.
export const TASK_IDEAS = {
    Coding: {
        placeholder: "e.g., Finish the report",
        ideas: ["Study 25 min", "Read 20 pages", "Practise a skill 30 min", "Clear the inbox"],
    },
    Fitness: {
        placeholder: "e.g., Walk 20 minutes",
        ideas: ["Walk 20 min", "Stretch 10 min", "Squats + push-ups, 3 rounds", "Jog 15 min", "Yoga 15 min"],
    },
    Finance: {
        placeholder: "e.g., Cancel a subscription I don't use",
        ideas: ["Review this week's spending", "Cancel an unused subscription", "Set next week's food budget", "Move money into savings"],
    },
};
