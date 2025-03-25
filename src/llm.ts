import { ChatCompletionMessageParam, CreateMLCEngine, MLCEngine } from "@mlc-ai/web-llm";
import { AsyncCriticalSection } from "./util";

export class AIManager {
    _engine: MLCEngine | null = null;
    _loadPercentage: number | null = null; // 0-1
    _queue: AsyncCriticalSection = new AsyncCriticalSection();
    public get isLoading(): boolean { return this._loadPercentage != null && !this.isReady; }
    public get isReady(): boolean { return this._loadPercentage >= 1; }
    public get isRunning(): boolean { return this._queue.isLocked; }
    public get loadPercentage(): number {
        return this._loadPercentage == null ? 0 : Math.max(this._loadPercentage, .05);
    }

    public async Setup(): Promise<void> {
        await this._queue.runInCriticalSection(async () => {
            if (this.isReady) return;
            this._loadPercentage = 0;
            // Llama-3.2-3B-Instruct-q4f32_1-MLC is quite slow
            this._engine = await CreateMLCEngine('Phi-3.5-mini-instruct-q4f16_1-MLC-1k', {
                initProgressCallback: ({ progress }) => {
                    this._loadPercentage = progress;
                    console.log(`Load Progress: ${progress * 100}`)
                },
            });
            this._loadPercentage = 1;
        });
    }
    public async RunPrompt(persona: string, prompts: string[], messages: ChatCompletionMessageParam[]): Promise<string> {
        let prefix: ChatCompletionMessageParam[] = [{ role: "user", content: prompts.join('\n') }];
        let system: ChatCompletionMessageParam[] = [{ role: "system", content: persona }];

        return await this.RunMessages(system.concat(prefix).concat(messages));
    }

    public async RunMessages(messages: ChatCompletionMessageParam[]): Promise<string> {
        await this.Setup();
        await this._queue.waitForCriticalSection();

        const reply = await this._engine.chat.completions.create({
            messages: messages,
        });

        console.log(reply.choices[0].message);
        this._queue.endCriticalSection();
        return reply.choices[0].message.content;
    }

    public async StreamPrompt(persona: string, prompts: string[], data: string[], streamer: (reply: string) => void): Promise<string> {
        let messages: ChatCompletionMessageParam[] = [{ role: "system", content: persona }];
        for (const line of prompts) {
            messages.push({ role: "user", content: line })
        }
        for (const line of data) {
            messages.push({ role: "user", content: line })
        }
        return await this.StreamMessages(messages, streamer);
    }

    public async StreamMessages(messages: ChatCompletionMessageParam[], streamer: (reply: string) => void): Promise<string> {
        await this.Setup();
        await this._queue.waitForCriticalSection();

        const chunks = await this._engine.chat.completions.create({
            messages: messages,
            stream: true,
        });
        let reply = "";
        for await (const chunk of chunks) {
            reply += chunk.choices[0]?.delta.content || "";
            streamer(reply);
        }

        console.log(reply);
        this._queue.endCriticalSection();
        return reply;
    }

    public async ChatLineCleanup(chat: string[], streamer: (replacement: string[]) => void): Promise<string[]> {
        let persona = `
            You are a professional editor. You will clean up an audio transcript, which may contain errors.
            You will get the complete transcript, and then correct individual lines of the transcript when prompted by the user.
            Change as little as possible on each line, just correct words that don't make sense and might have been a mistake. Remove filler words, but do not remove meaning.
            Sometimes the transcript gets confused and repeats a word or phrase. In this case, remove the duplicates.
            When prompted, return only the corrected line from the transcript. If the line is fine, return the line as-is.
            Do NOT return any extra text explaining what you did or why. Only return a clean line.
        `;
        let lines: string[] = [...chat];
        let messages: ChatCompletionMessageParam[] = [
            { role: "system", content: persona.trim() },
            { role: "user", content: "BEGIN TRANSCRIPT" },
        ];
        for (const line of chat) {
            messages.push({ role: "user", content: line });
        }
        messages.push({ role: "user", content: "END TRANSCRIPT" })
        for (let i = 0; i < chat.length; i++) {
            const line = chat[i];
            let prompt = `Correct this line: ${line}`;
            messages.push({ role: "user", content: prompt })
            let result = await this.RunMessages(messages);
            result = result.replace(/^"|"$/g, ""); // remove leading/trailing " character
            result = result.replace(/\*\*/g, ""); // replace ** that might be added for emphasis
            lines[i] = result;
            streamer(lines);
        }
        return lines;
    }

    public async ChatSummary(chat: string[], streamer: (replacement: string) => void): Promise<string> {
        let persona = `
            You are a professional secretary who is an expert of summarizing meetings and conversations.
            Keep your responses as short and succint as possible.
        `;
        let lines: string[] = [...chat];
        let messages: ChatCompletionMessageParam[] = [
            { role: "system", content: persona.trim() },
            { role: "user", content: "BEGIN TRANSCRIPT" },
        ];
        for (const line of chat) {
            messages.push({ role: "user", content: line })
        }
        messages.push({ role: "user", content: "END TRANSCRIPT" });
        messages.push({ role: "user", content: "Please summarize the previous transcript succinctly." });
        let output = await this.StreamMessages(messages, streamer);
        
        let followUps = `
            If there are any action items, list them out. If there are none, skip this step.
            Write any action item on it's own line. For example: "* action to take".
            Only include actions spoken in the transcript.
        `;
        messages.push({ role: "user", content: followUps.trim() });
        let tasks = await this.StreamMessages(messages, t => streamer(output + t ));
        return output + tasks;
    }
}


export var LLM: AIManager = new AIManager();