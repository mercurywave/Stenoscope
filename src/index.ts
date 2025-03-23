import { AudioAnalyzer } from "./audio analyzer";
import { Deferred } from "./util";
import { AudioVisualizer } from "./visualizer";

document.addEventListener("DOMContentLoaded", () => {
    incrementBubble();
    setup();
});

enum eRecordingState { Idle, Loading, Paused , Recording}

let _worker: Worker;
let _recordingStatus: eRecordingState = eRecordingState.Idle;

let _mediaRecorder: MediaRecorder;
let _audioChunks: Blob[] = [];

async function setup() {

    let btRecord = document.getElementById("btRecord");
    let divTps = document.getElementById("tps");
    let divTokens = document.getElementById("tokens");
    
    updateStatus(eRecordingState.Idle);

    _worker = new Worker(new URL("./transcribe worker.ts", import.meta.url), { type: "module" });

    _worker.addEventListener("message", (e: MessageEvent) => {
        const data = e.data;
        const { status } = data;

        switch (status) {
            case 'ready':
                console.log("Worker loaded");
                initAudio().then(() => {
                    updateStatus(eRecordingState.Paused);
                    btRecord.click();
                    loopFlushAudio();
                });
                break;

            case 'generate':
                if(data.output == '') break;
                getBubble(data.generationId).innerText = data.output;
                break;

            case 'update':
                divTps.innerText = data.tps;
                divTokens.innerText = data.numTokens;
                break;
        }
    });

    btRecord.addEventListener("click", async () => {
        if(_recordingStatus == eRecordingState.Idle){
            updateStatus(eRecordingState.Loading);
            _worker.postMessage({ type: "load" });
        }
        else if (_recordingStatus == eRecordingState.Paused) {
            _mediaRecorder.start();
        } else if (_recordingStatus == eRecordingState.Recording) {
            _mediaRecorder.stop();
        }
    });
}

let _mediaInit: Deferred<void> = null;
async function initAudio(){
    if(_mediaInit) {
        await _mediaInit;
        return;
    }
    _mediaInit = new Deferred();
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            sampleRate: 16000, // Set sample rate to 16kHz for ASR
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
        }
    });
    _mediaRecorder = new MediaRecorder(stream);
    let audioContext = new AudioContext({sampleRate: 16000});
    let audioAnalyzer = new AudioAnalyzer({sampleRate: audioContext.sampleRate});

    _mediaRecorder.onstart = (event) => {
        incrementBubble();
        _audioChunks = [];
        updateStatus(eRecordingState.Recording);
    };
    
    _mediaRecorder.ondataavailable = (event) => {
        if(event.data.size <= 0){
            return;
        }
        _audioChunks.push(event.data);
        const blob = new Blob(_audioChunks, { type: _mediaRecorder!.mimeType });
        const fileReader = new FileReader();
        fileReader.onloadend = async () => {
            try {
                const arrayBuffer = fileReader.result;

                const decoded = await audioContext.decodeAudioData(arrayBuffer as ArrayBuffer);
                const channelData = decoded.getChannelData(0);

                const analysis = audioAnalyzer.analyzeAudioData(channelData);
                if (!analysis.hasSpeech) {
                    return;
                }
                if(analysis.details.idleDurration > 3){
                    setTimeout(() => {
                        _mediaRecorder.stop();
                        _mediaRecorder.start();
                    }, 0);
                }

                _worker.postMessage({ type: 'generate', data: {
                    audio: channelData, 
                    language: 'english',
                    generationId: getGen(),
                } });
            } catch (e) {
                console.error('Error decoding audio data:', e);
            }
        }
        fileReader.readAsArrayBuffer(blob);
    };

    _mediaRecorder.onstop = async () => {
        updateStatus(eRecordingState.Paused);
    };
    _mediaInit.resolve();
    
    let viz = document.querySelector("#ctlViz") as AudioVisualizer;
    viz.Stream = stream;
}

function loopFlushAudio() {
    setTimeout(loopFlushAudio, 500);
    if (_recordingStatus == eRecordingState.Recording)
    {
        _mediaRecorder.requestData();
    }
}

let _bubbleArr: HTMLDivElement[] = [];
function getGen(): number {
    return _bubbleArr.length - 1;
}
function getBubble(id: number): HTMLDivElement { 
    return _bubbleArr[id];
}
let _currDiv: HTMLDivElement = null;
function incrementBubble(){
    if(_currDiv && _currDiv.innerText == "") { return; }
    let outputDiv = document.getElementById("output");
    _currDiv = document.createElement("div");
    _currDiv.className = "bubble";
    outputDiv.appendChild(_currDiv);
    _bubbleArr.push(_currDiv);
}

function updateStatus(status: eRecordingState){
    _recordingStatus = status;
    let divStatus = document.getElementById("recState");
    switch(status){
        case eRecordingState.Idle:
            divStatus.textContent = "⏹";
            break;
        case eRecordingState.Loading:
            divStatus.textContent = "⋯";
            break;
        case eRecordingState.Paused:
            divStatus.textContent = "⏺";
            break;
        case eRecordingState.Recording:
            divStatus.textContent = "⏸";
            break;
    }
}