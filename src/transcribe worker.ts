import { AutoProcessor, AutoTokenizer, MoonshineForConditionalGeneration, pipeline, PreTrainedModel, PreTrainedTokenizer, Processor, TextStreamer } from "@huggingface/transformers";

let _manager: Manager;
class Manager {
    _modelId = "onnx-community/moonshine-tiny-ONNX";
    _tokenizer: PreTrainedTokenizer = null;
    _processor: Processor = null;
    _model: PreTrainedModel = null;
    _processsing = false;
    _loaded = false;
    //_instance: AutomaticSpeechRecognitionPipeline = null;

    public async setup() {
        this._tokenizer = await AutoTokenizer.from_pretrained(this._modelId, {
            progress_callback: progressCallback
        });
        this._processor = await AutoProcessor.from_pretrained(this._modelId, {
            progress_callback: progressCallback
        });
        this._model = await MoonshineForConditionalGeneration.from_pretrained(this._modelId, {
            progress_callback: progressCallback,
            dtype: {
                encoder_model: 'fp32', // 'fp16' works too
                decoder_model_merged: 'q4',
            },
            device: 'webgpu',
        } as any); // seems like there are parameters that aren't in the type defs
        // this._instance = await pipeline("automatic-speech-recognition", this._modelId, {
        //     progress_callback: progressCallback,
        //     dtype: {
        //         encoder_model: 'fp32', // 'fp16' works too
        //         decoder_model_merged: 'q4', // or 'fp32' ('fp16' is broken)
        //     },
        //     device: 'webgpu',
        // } as any); // seems like there are parameters that aren't in the type defs
        self.postMessage({ status: 'ready' });
        this._loaded = true;
    }

    // @ts-ignore
    public async run({ audio, language, generationId }) {
        if (!this._loaded || this._processsing) return;
        this._processsing = true;
        self.postMessage({ status: 'start' });

        let startTime = performance.now();
        let numTokens = 0;
        const callbackFunction = (output) => {
            let tps;
            if (numTokens++ > 0) {
                tps = numTokens / (performance.now() - startTime) * 1000;
            }
            self.postMessage({
                status: 'update',
                output, tps, numTokens, generationId
            });
        }

        const streamer = new TextStreamer(this._tokenizer, {
            skip_prompt: true,
            decode_kwargs: {
                skip_special_tokens: true,
            },
            skip_special_tokens: true,
            callback_function: callbackFunction,
        });

        const inputs = await this._processor(audio);
        const outputs = await this._model.generate(
            {
                ...inputs,
                max_new_tokens: 64,
                language,
                streamer,
            } //as any // seems like there are parameters that aren't in the type defs
        );
        const outputText = this._tokenizer.batch_decode(outputs as any, { skip_special_tokens: true });
        console.log(outputText);

        self.postMessage({
            status: 'generate',
            output: outputText,
            generationId
        });

        this._processsing = false;
    }
}

function progressCallback(msg) {
    //console.log(msg);
}

self.addEventListener('message', async (e: MessageEvent) => {
    const { type, data } = e.data;

    switch (type) {
        case 'load':
            if (!_manager) {
                _manager = new Manager();
                _manager.setup();
            }
            break;

        case 'generate':
            _manager?.run(data);
            break;
    }
});