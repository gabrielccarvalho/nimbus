import { ArrowRightIcon } from "@phosphor-icons/react/ssr"

import { DotMeter } from "@/components/ui/dot-meter"
import { getMessages } from "@/lib/i18n/server"

import { auth } from "./messages"

const dots =
  "bg-graphite-2 bg-[radial-gradient(circle_at_center,rgb(255_255_255/.07)_1px,transparent_1.5px)] bg-size-[11px_11px]"

export async function AuthGlimpse() {
  const t = (await getMessages(auth)).glimpse
  return (
    <aside
      aria-hidden
      className="relative hidden min-w-0 flex-[1_1_520px] place-items-center overflow-hidden bg-[radial-gradient(circle_at_center,rgb(255_255_255/.06)_1px,transparent_1.5px)] bg-size-[14px_14px] px-6 py-12 before:pointer-events-none before:absolute before:top-1/2 before:left-1/2 before:h-[900px] before:w-[1100px] before:-translate-1/2 before:bg-[radial-gradient(closest-side,rgb(120_132_230/.085),rgb(120_132_230/.03)_55%,transparent)] lg:grid"
    >
      <div className="relative flex items-center gap-7">
        <div
          className={`relative aspect-video w-[360px] rounded-2xl shadow-[inset_0_0_0_1px_rgb(255_255_255/.07),0_40px_80px_-30px_rgb(0_0_0/.8)] ${dots}`}
        >
          <span className="absolute top-[52%] left-[66%] h-[44%] w-[30%] rounded-md shadow-[0_0_0_2px_var(--lav)]" />
          <span className="absolute top-[4%] left-[14%] h-[92%] w-1/2 rounded-md outline-[1.5px] -outline-offset-[1.5px] outline-white/45 outline-dashed" />
          <span className="absolute top-2.5 left-2.5 rounded-[7px] bg-night/70 px-[7px] py-[5px] font-mono text-[11px] font-semibold backdrop-blur-sm">
            51:06
          </span>
        </div>
        <ArrowRightIcon className="size-5 text-tertiary" />
        <div className="relative aspect-[9/16] w-[210px] overflow-hidden rounded-[22px] bg-graphite shadow-[inset_0_0_0_1px_rgb(255_255_255/.1),0_50px_100px_-30px_rgb(0_0_0/.9)]">
          <div className={`absolute inset-x-0 top-0 bottom-[62%] ${dots}`} />
          <div className={`absolute inset-x-0 top-[38%] bottom-0 ${dots}`} />
          <div className="absolute inset-x-[10%] top-[70%] text-center text-[17px] leading-[1.1] font-extrabold tracking-[-0.01em] text-white uppercase [text-shadow:0_2px_0_#000,0_0_12px_rgb(0_0_0/.8)]">
            sair <em className="text-amber not-italic">manobra,</em> hein?
          </div>
        </div>
        <div className="absolute -top-9 -right-6 flex items-center gap-2 surface-menu rounded-[14px] px-3 py-2 text-[13px]">
          <DotMeter value={7} />
          <span className="font-semibold">Jet ski voa alto</span>
          <span className="font-mono text-tertiary">0:16</span>
        </div>
        <div className="absolute -bottom-11 left-10 surface-menu rounded-[14px] px-3 py-2 text-[13px] text-muted-foreground">
          {t.webcam}
        </div>
      </div>
    </aside>
  )
}
