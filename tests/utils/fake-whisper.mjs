#!/usr/bin/env node
import { writeFileSync } from "node:fs"

const args = process.argv.slice(2)
const value = (flag) => args[args.indexOf(flag) + 1]

if (process.env.FAKE_WHISPER_FAIL) {
  process.stderr.write("error: failed to load model\n")
  process.exit(3)
}
if (process.env.FAKE_WHISPER_ARGS) {
  writeFileSync(process.env.FAKE_WHISPER_ARGS, JSON.stringify(args))
}
process.stderr.write("whisper_print_progress_callback: progress =  50%\n")
writeFileSync(
  `${value("-of")}.json`,
  JSON.stringify({
    result: { language: value("-l") === "auto" ? "en" : value("-l") },
    transcription: [
      {
        offsets: { from: 0, to: 900 },
        text: " Hello there.",
        tokens: [
          { text: "[_BEG_]", offsets: { from: 0, to: 0 }, p: 1 },
          { text: " Hello", offsets: { from: 100, to: 400 }, p: 0.9 },
          { text: " there", offsets: { from: 450, to: 850 }, p: 0.8 },
          { text: ".", offsets: { from: 850, to: 900 }, p: 0.99 },
        ],
      },
    ],
  })
)
process.stderr.write("whisper_print_progress_callback: progress = 100%\n")
