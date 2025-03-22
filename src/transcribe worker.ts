import { AutoProcessor, AutoTokenizer, PreTrainedModel, PreTrainedTokenizer, Processor, WhisperForConditionalGeneration } from "@xenova/transformers";

let _manager: Manager;
class Manager {
    _modelId = "onnx-community/whisper-base";
    _tokenizer: PreTrainedTokenizer = null;
    _processor: Processor = null;
    _model: PreTrainedModel = null;
    _processsing = false;

    public async setup() {
        this._tokenizer = await AutoTokenizer.from_pretrained(this._modelId, {
            progress_callback: progressCallback
        });
        this._processor = await AutoProcessor.from_pretrained(this._modelId, {
            progress_callback: progressCallback
        });
        this._model = await WhisperForConditionalGeneration.from_pretrained(this._modelId, {
            progress_callback: progressCallback,
            dtype: {
                encoder_model: 'fp32', // 'fp16' works too
                decoder_model_merged: 'q4', // or 'fp32' ('fp16' is broken)
            },
            device: 'webgpu',
        } as any); // seems like there are parameters that aren't in the type defs
        self.postMessage({ status: 'ready' });
    }

    public async run({ audio, language }) {
        if (this._processsing) return;
        this._processsing = true;
        self.postMessage({ status: 'start' });

        const inputs = await this._processor(audio);
        const outputs = await this._model.generate(inputs,
            {
                max_new_tokens: 64,
                language,
            }
        );
        const outputText = this._tokenizer.batch_decode(outputs, { skip_special_tokens: true });

        self.postMessage({
            status: 'generate',
            output: outputText,
        });

        this._processsing = false;
    }
}

function progressCallback(msg) {
    console.log(msg);
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