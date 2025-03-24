import { ChatCompletionMessageParam, CreateMLCEngine, MLCEngine } from "@mlc-ai/web-llm";
import { AsyncCriticalSection } from "./util";

export class AIManager {
    _engine: MLCEngine | null = null;
    _loadPercentage: number | null = null; // 0-1
    _queue:AsyncCriticalSection = new AsyncCriticalSection();
    public get isLoading(): boolean { return this._loadPercentage != null && !this.isReady; }
    public get isReady(): boolean { return this._loadPercentage >= 1; }
    public get isRunning(): boolean { return this._queue.isLocked; }
    public get loadPercentage(): number {
         return this._loadPercentage == null ? 0 : Math.max(this._loadPercentage, .05); 
    }

    public async Setup(): Promise<void>{
        await this._queue.runInCriticalSection(async () =>{
            if(this.isReady) return;
            this._loadPercentage = 0;
            this._engine = await CreateMLCEngine('Llama-3.2-3B-Instruct-q4f32_1-MLC', {
                initProgressCallback: ({progress}) => {
                    this._loadPercentage = progress;
                    console.log(`Load Progress: ${progress * 100}`)
                },
            });
            this._loadPercentage = 1;
        });
    }
    public async RunPrompt(persona: string, prompts: string[], messages: ChatCompletionMessageParam[]): Promise<string>{
        let prefix: ChatCompletionMessageParam[] = [{ role: "user", content: prompts.join('\n') }];
        let system: ChatCompletionMessageParam[] = [{ role: "system", content: persona }];

        return await this.RunMessages(system.concat(prefix).concat(messages));
    }

    public async RunMessages(messages: ChatCompletionMessageParam[]): Promise<string>{
        await this.Setup();
        await this._queue.waitForCriticalSection();
        
        const reply = await this._engine.chat.completions.create({
            messages: messages,
        });

        console.log(reply.choices[0].message);
        this._queue.endCriticalSection();
        return reply.choices[0].message.content;
    }

    public async StreamPrompt(persona: string, prompts: string[], data: string[], streamer: (reply:string) => void ): Promise<string>{
        let messages: ChatCompletionMessageParam[] = [{ role: "system", content: persona }];
        for (const line of prompts) {
            messages.push({ role: "user", content: line })
        }
        for (const line of data) {
            messages.push({ role: "user", content: line })
        }
        return await this.StreamMessages(messages, streamer);
    }

    public async StreamMessages(messages: ChatCompletionMessageParam[], streamer: (reply:string) => void ): Promise<string> {
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
}


export var LLM: AIManager = new AIManager();