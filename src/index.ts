
document.addEventListener("DOMContentLoaded", () => {
    setup();
});

let _worker: Worker;

async function setup() {

    _worker = new Worker(new URL("./transcribe worker.ts", import.meta.url), { type: "module" });

    _worker.addEventListener("message", (e: MessageEvent) => {
        const { type, data } = e.data;

        switch (type) {
            case 'ready':
                console.log("Worker loaded");
                break;

            case 'generate':
                console.log("Generated:", data);
                break;
        }
    });

    let btRecord = document.getElementById("btRecord");
    let outputDiv = document.getElementById("output");

    let isRecording = false;
    let mediaRecorder: MediaRecorder;
    let audioChunks: Blob[] = [];

    btRecord.addEventListener("click", async () => {
        if (!isRecording) {
            _worker.postMessage({ type: "load" });
            // Start recording
            isRecording = true;
            btRecord.textContent = "⏸"; // Update button state

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000, // Set sample rate to 16kHz for ASR
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                }
            });
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
                const blob = new Blob([event.data], { type: this.recorder!.mimeType });
                const fileReader = new FileReader();
                fileReader.onloadend = async () => {
                    try {
                        const arrayBuffer = fileReader.result;

                        const decoded = await this.audioContext.decodeAudioData(arrayBuffer as ArrayBuffer);
                        const channelData = decoded.getChannelData(0);

                        const analysis = this.audioAnalyzer.analyzeAudioData(channelData);
                        if (!analysis.hasSpeech) {
                            return;
                        }

                        this.worker.postMessage({ type: 'generate', data: { audio: channelData, language: 'english' } });
                    } catch (e) {
                        console.error('Error decoding audio data:', e);
                    }
                }
                fileReader.readAsArrayBuffer(blob);
            };

            mediaRecorder.onstop = async () => {
                audioChunks = []; // Clear chunks for next recording
            };

            mediaRecorder.start();
        } else {
            // Stop recording
            isRecording = false;
            btRecord.textContent = "⏹"; // Update button state
            mediaRecorder.stop();
        }
    });
}

