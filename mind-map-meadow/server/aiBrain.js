import { pool } from "./db.js";

let isAiThinking = false;

function setRandomWanderTarget(gameContext) {
    const targetX = Math.floor(Math.random() * 20 + 5) * 48 + 24;
    const targetY = Math.floor(Math.random() * 15 + 5) * 48 + 24;
    console.log(`🎯 [AI Action] Target Lock: Wandering to empty cell [X: ${targetX}, Y: ${targetY}]`);
    gameContext.aiTargetPos = { x: targetX, y: targetY };
}

export async function triggerLlamaBrainDecision(io, gameContext) {
    if (isAiThinking) {
        console.log("⏳ [AI Brain] Previous request still processing. Skipping interval...");
        return;
    }

    console.log("🧠 [AI Brain] Starting decision cycle...");
    isAiThinking = true;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5-minute safety threshold window

    try {
        const statsQuery = await pool.query("SELECT * FROM player_stats WHERE username = 'chong' LIMIT 1");
        const tasksQuery = await pool.query("SELECT title, category, status FROM tasks LIMIT 5");
        const buildingsQuery = await pool.query("SELECT id, x, y FROM buildings");

        const stats = statsQuery.rows[0] || { level: 1, coins: 0 };
        const buildingsList = buildingsQuery.rows.map((b) => `ID:${b.id} (X:${b.x},Y:${b.y})`).join(", ");

        console.log("🧠 [AI Brain] Sending structured payload to local Ollama container...");

        const response = await fetch("http://ollama:11434/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
                model: "llama3.2:latest",
                prompt: `You are an autonomous companion circle in a game. User: 'Chong'. Stats: Level ${stats.level}, Coins: ${stats.coins}. Tasks: ${JSON.stringify(tasksQuery.rows)}. Map buildings: [${buildingsList}].
                Pick an action: FOLLOW_PLAYER, WANDER, or INSPECT_BUILDING:id.
                Respond ONLY in this exact plain text layout:
                ACTION: <your chosen action> | THOUGHT: <1 sentence comment to Chong>`,
                stream: false,
                options: {
                    num_ctx: 512,
                    num_predict: 40,
                    temperature: 0.6,
                },
            }),
        });

        clearTimeout(timeoutId);

        const data = await response.json();
        const rawAiOutput = data.response;
        console.log(`🧠 [AI Brain] Raw Output Received:\n"${rawAiOutput}"`);

        // Text parsing logic
        let parsedThought = "Awaiting your next objective, Chong...";
        if (rawAiOutput.includes("THOUGHT:")) {
            parsedThought = rawAiOutput.split("THOUGHT:")[1].trim();
        } else {
            parsedThought = rawAiOutput.replace(/ACTION:.*\|/g, "").trim();
        }

        gameContext.aiCurrentThought = parsedThought;
        io.emit("ai_thought_broadcast", { thought: gameContext.aiCurrentThought });

        // Action routing rule assessment algorithms
        if (rawAiOutput.includes("FOLLOW_PLAYER")) {
            console.log("🎯 [AI Action] Target Lock: Moving to follow Chong.");
            gameContext.aiTargetPos = { x: gameContext.playerPos.x, y: gameContext.playerPos.y };
        } else if (rawAiOutput.includes("INSPECT_BUILDING")) {
            const match = rawAiOutput.match(/INSPECT_BUILDING:(\d+)/);
            if (match && match[1]) {
                const bId = parseInt(match[1]);
                const matchBuilding = buildingsQuery.rows.find((b) => b.id === bId);
                if (matchBuilding) {
                    console.log(`🎯 [AI Action] Target Lock: Traveling to inspect Building #${bId}`);
                    gameContext.aiTargetPos = { x: parseFloat(matchBuilding.x), y: parseFloat(matchBuilding.y) };
                } else {
                    setRandomWanderTarget(gameContext);
                }
            } else {
                setRandomWanderTarget(gameContext);
            }
        } else {
            setRandomWanderTarget(gameContext);
        }

        await pool.query(`INSERT INTO ai_analysis (analysis_text, raw_response) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [gameContext.aiCurrentThought, rawAiOutput]);
    } catch (err) {
        if (err.name === "AbortError") {
            console.error("❌ [AI Brain Timeout]: Model setup exceeded 5-minute allocation ceiling.");
        } else {
            console.error("❌ [AI Brain Failure]:", err.message);
        }
    } finally {
        isAiThinking = false;
    }
}
