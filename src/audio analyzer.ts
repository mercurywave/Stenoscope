interface AudioAnalyzerOptions {
    energyThreshold?: number;
    frameSize?: number;
    minDuration?: number;
    sampleRate?: number;
}

interface AnalysisDetails {
    totalFrames: number;
    consecutiveSpeechSamples: number;
    threshold: number;
    minDuration: number;
    averageEnergy: number;
    idleDurration: number;
}

interface AnalysisResult {
    hasSpeech: boolean;
    details: AnalysisDetails;
}

export class AudioAnalyzer {
    private readonly energyThreshold: number;
    private readonly frameSize: number;
    private readonly minDuration: number;
    private readonly sampleRate: number;

    constructor(options: AudioAnalyzerOptions = {}) {
        this.energyThreshold = options.energyThreshold ?? 0.01;
        this.frameSize = options.frameSize ?? 2048;
        this.minDuration = options.minDuration ?? 0.1;
        this.sampleRate = options.sampleRate ?? 44100;
    }

    public analyzeAudioData(channelData: Float32Array): AnalysisResult {
        const frames: number = Math.floor(channelData.length / this.frameSize);
        const samplesNeededForMinDuration: number = Math.floor(this.sampleRate * this.minDuration);
        let consecutiveSpeechSamples: number = 0;
        let consecutiveIdleSamples: number = 0;
        let hasSpeech: boolean = false;
        let totalEnergy: number = 0;
        let idleTrail: number = 0;

        for (let i = frames - 1; i >= 0 && !hasSpeech; i--) {
            const startIdx: number = i * this.frameSize;
            const frame: Float32Array = channelData.subarray(startIdx, startIdx + this.frameSize);

            const frameEnergy: number = this.calculateFrameEnergy(frame);
            totalEnergy += frameEnergy;

            if (frameEnergy > this.energyThreshold) {
                consecutiveIdleSamples = 0;
                consecutiveSpeechSamples += this.frameSize;
                if (consecutiveSpeechSamples >= samplesNeededForMinDuration) {
                    hasSpeech = true;
                    idleTrail = this.frameSize * (frames - i - 1);
                }
            } else {
                consecutiveIdleSamples += this.frameSize;
                if (consecutiveIdleSamples > samplesNeededForMinDuration * 4) {
                    consecutiveSpeechSamples = 0;
                }
            }
        }
        if(!hasSpeech) idleTrail = this.frameSize * frames;

        // let test =[];
        // for (let i = 0; i < frames; i++) {
        //     const startIdx: number = i * this.frameSize;
        //     const frame: Float32Array = channelData.subarray(startIdx, startIdx + this.frameSize);
        //     const frameEnergy: number = this.calculateFrameEnergy(frame);
        //     test.push(frameEnergy);
        // }
        // console.log(test);

        return {
            hasSpeech,
            details: {
                totalFrames: frames,
                consecutiveSpeechSamples,
                threshold: this.energyThreshold,
                minDuration: this.minDuration,
                averageEnergy: totalEnergy / frames,
                idleDurration: idleTrail / this.sampleRate,
            }
        };
    }

    private calculateFrameEnergy(frame: Float32Array): number {
        let sum: number = 0;
        for (let i = 0; i < frame.length; i++) {
            sum += Math.abs(frame[i]);
        }
        return sum / frame.length;
    }
}