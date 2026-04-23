declare module 'tar-stream' {
    import { PassThrough } from 'stream';

    interface Headers {
        name: string;
        size?: number;
        mode?: number;
        mtime?: Date;
        type?: string;
        linkname?: string | null;
        uid?: number;
        gid?: number;
        uname?: string;
        gname?: string;
        devmajor?: number;
        devminor?: number;
    }

    type EntryCallback = (err?: Error | null) => void;

    interface Extract extends NodeJS.WritableStream {
        on(event: 'entry', listener: (header: Headers, stream: PassThrough, callback: EntryCallback) => void): this;
        on(event: 'finish', listener: () => void): this;
        on(event: 'error', listener: (err: Error) => void): this;
        on(event: string, listener: (...args: unknown[]) => void): this;
    }

    function extract(): Extract;
}
