// opus-recorder não traz tipos — só o que usamos (gravação Ogg/Opus no navegador)
declare module 'opus-recorder' {
  export default class Recorder {
    constructor(config?: {
      encoderPath?: string
      encoderSampleRate?: number
      encoderApplication?: number
      numberOfChannels?: number
      streamPages?: boolean
      maxFramesPerPage?: number
      mediaTrackConstraints?: boolean | MediaTrackConstraints
    })
    static isRecordingSupported(): boolean
    start(): Promise<void>
    stop(): Promise<void>
    close(): Promise<void>
    ondataavailable: (dados: Uint8Array) => void
    onstop: () => void
  }
}
