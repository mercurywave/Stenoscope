import { AutomaticSpeechRecognitionPipeline, pipeline } from "@huggingface/transformers";

// this is much slower, but seems higher quality

let _manager: Manager;
class Manager {
    _modelId = "onnx-community/whisper-tiny"; // TODO: give option to switch to base model instead of tiny
    _processsing = false;
    _loaded = false;
    _instance: AutomaticSpeechRecognitionPipeline = null;

    public async setup() {
        this._instance = await pipeline("automatic-speech-recognition", this._modelId, {
            progress_callback: progressCallback,
            dtype: {
                encoder_model: 'fp16', // 'fp16' works too
                decoder_model_merged: 'q4', // or 'fp32' ('fp16' is broken)
            },
            device: 'webgpu',
        } as any); // seems like there are parameters that aren't in the type defs
        self.postMessage({ status: 'ready' });
        this._loaded = true;
    }

    public async run({ audio, language, generationId }) {
        if (!this._loaded || this._processsing) return;
        this._processsing = true;
        self.postMessage({ status: 'start' });

        const transcriber = this._instance;

        const chunk_length_s = 30;
        const stride_length_s = 5;

        // Actually run transcription
        const output = await transcriber(audio, {
            // Greedy
            top_k: 0,
            do_sample: false,

            // Sliding window
            chunk_length_s,
            stride_length_s,

            // Language and task
            language,
            task: "transcribe",

            // Return timestamps
            return_timestamps: true,
            force_full_sequences: false,

            // Callback functions
            //streamer, // after each generation step
        }).catch((error) => {
            console.error(error);
            self.postMessage({
                status: "error",
                data: error,
            });
            return null;
        });
        console.log(output);

        self.postMessage({
            status: 'generate',
            output: output.text,
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