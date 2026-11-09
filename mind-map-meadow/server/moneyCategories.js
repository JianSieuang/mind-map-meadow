// Money categories, shared by the server (validation) and the client (Quick log). Plain data,
// no imports, so Vite can bundle it too. The category names are stored in the DB: rename one
// only with a migration. Subcategories are optional and can be added freely.
export const MONEY_CATEGORIES = {
    expense: {
        Food: ["Breakfast", "Lunch", "Dinner", "Snacks", "Drinks", "Groceries"],
        Transport: ["Public transport", "Fuel", "Taxi", "Parking", "Car care"],
        Shopping: ["Clothes", "Electronics", "Household", "Personal care"],
        Bills: ["Rent", "Utilities", "Phone & internet", "Subscriptions", "Insurance"],
        Fun: ["Going out", "Movies", "Games", "Hobbies"],
        Health: ["Doctor", "Medicine", "Sports"],
        Travel: ["Flights", "Hotel", "Activities"],
        Learning: ["Courses", "Books"],
        "Family & gifts": ["Family", "Gifts", "Charity", "Pets"],
        Other: [],
    },
    income: {
        Salary: [],
        "Side Income": ["Freelance", "Selling", "Tips"],
        Investments: ["Interest", "Dividends"],
        Gift: [],
        Other: [],
    },
    saving: { Savings: [] },
};

export function categoryNames(direction) {
    return Object.keys(MONEY_CATEGORIES[direction] || {});
}

export function subcategoryNames(direction, category) {
    const list = MONEY_CATEGORIES[direction];
    return list && Object.hasOwn(list, category) ? list[category] : [];
}
