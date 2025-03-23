import { util } from "./util";

export class AudioVisualizer extends HTMLElement {
    static _tmplt = util.mkTmplt(/* html */`
        <div class="wrapper">
            <canvas class="rend"></canvas>
        </div>
        <style>
            .wrapper{
                display: block;
            }
            canvas{
                display: block;
                width: 75px;
                height: 75px;
            }
        </style>
    `);
    constructor() {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        shadow.append(AudioVisualizer._tmplt.content.cloneNode(true));
    }

    private _canvas: HTMLCanvasElement;

    connectedCallback() {
        this._canvas = this.shadowRoot.querySelector("canvas");
        this._canvas.width = 150;
        this._canvas.height = 150;
        this.drawZeroState();
    }

    private _stream: MediaStream;
    private _analyser: AnalyserNode;
    private _dataArray: Uint8Array;
    private _bufferLength: number;

    public set Stream(value){
        this._stream = value;
        const audioContext = new (window.AudioContext)();
        const source = audioContext.createMediaStreamSource(this._stream);
        this._analyser = audioContext.createAnalyser();
        this._analyser.fftSize = 2048;
        source.connect(this._analyser);

        this._bufferLength = this._analyser.frequencyBinCount;
        this._dataArray = new Uint8Array(this._bufferLength);
        this.draw();
    }

    private drawZeroState() {
        const canvas = this._canvas;
        const canvasCtx = canvas.getContext('2d');
        
        canvasCtx.fillStyle = 'rgb(255, 255, 255)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        canvasCtx.lineWidth = 10;
        canvasCtx.strokeStyle = 'rgb(33, 66, 99)';
        canvasCtx.beginPath();

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(canvas.width, canvas.height) / 3;
        
        canvasCtx.beginPath();
        canvasCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI); // Full circle
        canvasCtx.stroke();
    }

    private draw() {
        if (!this._stream) {
            this.drawZeroState();
            return;
        }
        requestAnimationFrame(() => this.draw());
        const canvas = this._canvas;
        const canvasCtx = canvas.getContext('2d');

        this._analyser.getByteTimeDomainData(this._dataArray);

        canvasCtx.fillStyle = 'rgb(255, 255, 255)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        canvasCtx.lineWidth = 10;
        canvasCtx.strokeStyle = 'rgb(33, 66, 99)';
        canvasCtx.beginPath();

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(canvas.width, canvas.height) / 3;

        for (let i = 0; i < this._bufferLength; ++i) {
            const angle = (i / this._bufferLength) * 2 * Math.PI;
            const v = (this._dataArray[i] - 128) / 128.0;
            const distortion = radius * v / 4;
            const x = centerX + (radius + distortion) * Math.cos(angle);
            const y = centerY + (radius + distortion) * Math.sin(angle);

            if (i === 0) {
                canvasCtx.moveTo(x, y);
            } else {
                canvasCtx.lineTo(x, y);
            }
        }

        canvasCtx.closePath();
        canvasCtx.stroke();
    }
}

customElements.define("audio-visualizer", AudioVisualizer);