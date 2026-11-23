import { Readable } from "node:stream"

// Next's request body adapter keeps enqueuing after the stream is cancelled
// and throws an uncaught ERR_INVALID_STATE, so a rejected body is drained
// instead of cancelled.
export function readableFromRequestBody(
  body: ReadableStream<Uint8Array>
): Readable {
  const reader = body.getReader()
  let finished = false
  return new Readable({
    read() {
      reader.read().then(
        ({ value, done }) => {
          if (done) {
            finished = true
            this.push(null)
          } else {
            this.push(value)
          }
        },
        (error: unknown) => {
          finished = true
          this.destroy(error as Error)
        }
      )
    },
    destroy(error, callback) {
      if (!finished) void drain(reader)
      callback(error)
    },
  })
}

async function drain(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    while (!(await reader.read()).done) {}
  } catch {}
}
