import type { RenderQuality } from "@/features/projects/schema"
import type { PrivacyStatus } from "@/features/publishing/schema"
import { defineMessages, plural } from "@/lib/i18n/messages"

const en = new Intl.NumberFormat("en-US")
const pt = new Intl.NumberFormat("pt-BR")
const tenths = { minimumFractionDigits: 1, maximumFractionDigits: 1 }
const enTenths = new Intl.NumberFormat("en-US", {
  ...tenths,
  useGrouping: false,
})
const ptTenths = new Intl.NumberFormat("pt-BR", {
  ...tenths,
  useGrouping: false,
})

const cortes = (count: number) =>
  plural("pt-BR", count, { one: "corte", other: "cortes" })

export const review = defineMessages({
  "en-US": {
    clipsPage: {
      title: "Clips",
      emptyTitle: "No clips yet",
      emptyFailed:
        "The pipeline stopped before finding highlights. Retry it from the overview.",
      emptyPending: (step: string) =>
        `Highlights appear here once selection finishes. Current step: ${step}.`,
    },
    transcriptPage: {
      title: "Transcript",
      emptyTitle: "No transcript yet",
      emptyFailed:
        "Transcription didn't finish. Retry the project from the overview.",
      emptyPending: (step: string) =>
        `The transcript appears here once transcription finishes. Current step: ${step}.`,
      skippedTitle: "Transcription was skipped",
      skippedNoKey:
        "This workspace has no Groq key, so the recording wasn't transcribed. Highlights came from the audio and clips have no captions.",
      skippedWithKey:
        "This recording was imported before the workspace had a Groq key. Transcribe it from the overview.",
      skippedRateLimited:
        "Groq's rate limit was reached, so the recording wasn't transcribed. Highlights came from the audio and clips have no captions. Transcribe it from the overview once the limit resets.",
      skippedRejected:
        "Groq rejected the workspace's key, so the recording wasn't transcribed. Highlights came from the audio and clips have no captions.",
      addKey: "Add a key in Settings →",
      checkKey: "Check the key in Settings →",
      openOverview: "Open the overview →",
    },
    grid: {
      list: "Clips",
      score: (score: number) => `Score ${score}`,
      parts: (count: number) => `${count} parts`,
      rendered: "Rendered",
      rendering: "Rendering",
      approved: "Approved",
      restore: "Restore clip",
      reject: "Reject clip",
    },
    status: {
      rejected: (title: string) => `Rejected “${title}”`,
      undo: "Undo",
    },
    bar: {
      approved: (count: number) => `${count} approved`,
      rendered: (count: number) => `${count} rendered`,
      toReview: (count: number) => `${count} to review`,
      empty: "No clips yet",
      onlyApproved: "Only approved clips render.",
      onlyApprovedMinutes: (minutes: number) =>
        `Only approved clips render. About ${minutes} ${plural("en-US", minutes, { one: "render minute", other: "render minutes" })}.`,
      approveAll: (count: number) => `Approve all ${count}`,
      approvedToast: (count: number) =>
        `Approved ${count} ${plural("en-US", count, { one: "clip", other: "clips" })}`,
      downloadAll: "Download all",
      moreExports: "More exports: horizontal edit",
      renderEdit: "Render horizontal edit",
      renderingEditToast: "Rendering the edit",
      downloadEdit: (duration: string) => `Download edit (${duration})`,
      renderApproved: "Render approved clips",
      renderingClips: (count: number) =>
        `Rendering ${count} ${plural("en-US", count, { one: "clip", other: "clips" })}`,
      cancelledClips: "Cancelled clip renders",
      renderingEdit: "Rendering the horizontal edit",
      cancelledEdit: "Cancelled the edit render",
    },
    list: {
      filter: "Filter clips",
      filters: {
        all: "All",
        todo: "To review",
        approved: "Approved",
        rejected: "Rejected",
      },
      sort: { best: "Best first", time: "In order" },
      finding: "Finding highlights…",
      findMore: "Find more highlights",
      findingToast: "Looking for more highlights",
      empty: "Nothing here right now.",
      hint: "Click a clip to open it in the editor.",
      hintApprove: "approve",
      hintReject: "reject",
      hintNext: "next",
      timeline: "Clips in the recording",
    },
    stats: {
      label: "YouTube stats",
      removed: "Removed from YouTube",
      views: (count: number) => `${en.format(count)} views`,
      likes: (count: number) => `${en.format(count)} likes`,
      comments: (count: number) => `${en.format(count)} comments`,
      averageView: (seconds: number) =>
        `${enTenths.format(seconds)} s average view`,
      averageWatched: (percent: number) => `${percent}% watched on average`,
      retention: "Retention: share of viewers still watching across the clip",
      noRetention: "YouTube hasn't shared the retention curve yet",
      empty: "No stats yet",
      early: "Data still coming in",
      refreshing: "Refreshing…",
      refresh: "Refresh stats",
    },
    preview: {
      label: "Vertical preview with captions",
      captionPosition: "Caption position",
      captionsPosition: (lane: number) => `Captions ${lane} position`,
    },
    exportMenu: {
      quality: {
        draft: "Draft",
        standard: "Standard",
        high: "High",
      } satisfies Record<RenderQuality, string>,
      seconds: (seconds: number) => `${enTenths.format(seconds)} s`,
      justNow: "just now",
      minutesAgo: (minutes: number) => `${minutes} min ago`,
      hoursAgo: (hours: number) => `${hours} h ago`,
      daysAgo: (days: number) => `${days} d ago`,
      rendering: (percent: number) => `Rendering ${percent}%`,
      queued: "Queued to render",
      failed: "Render failed",
      outdated: "Edited since last render",
      rendered: "Rendered",
      notRendered: "Not rendered",
      render: "Render",
      rerender: "Re-render",
      more: "More export options",
      lastRender: (ago: string) => `Last render · ${ago}`,
      notRenderedYet: "Not rendered yet",
      watch: "Watch last render",
      download: "Download last render",
      published: "Published on YouTube",
      live: "Live",
      publishFailedRetry: "Publish failed · Retry",
      publishAgain: "Publish again…",
      publish: "Publish to YouTube…",
      editedSincePublish: "Edited since publish",
      renderQuality: (quality: string) => `Render quality: ${quality}`,
      watchTitle: "Last render",
      watchDescription: "The file that downloads and publishes.",
      video: "Rendered clip",
    },
    publication: {
      published: "Published",
      newTab: "(opens in a new tab)",
      failed: "Publish failed",
      waitingQuota: "Waiting for YouTube's daily limit",
      publishing: (progress?: number) =>
        progress === undefined ? "Publishing…" : `Publishing… ${progress}%`,
    },
    publish: {
      privacy: {
        public: "Public",
        unlisted: "Unlisted",
        private: "Private",
      } satisfies Record<PrivacyStatus, string>,
      blocked: {
        render: "Render the latest edit first",
        connect: "Connect YouTube in Settings › Connected channels",
        reconnect: "Reconnect YouTube in Settings › Connected channels",
        limit: "Your plan's daily publish limit is reached",
      },
      futureTime: "Pick a publish time in the future",
      invalid: "Check the publish details",
      scheduledToast: "Scheduled on YouTube",
      publishingToast: "Publishing to YouTube",
      title: "Title",
      description: "Description",
      tags: "Tags",
      tagsHint: "Separate tags with commas.",
      privacyLabel: "Privacy",
      scheduledHint: "Scheduled videos stay private until they go live.",
      soundTitle: "This clip has a sound to add",
      soundBody: (sound: string) =>
        `Publishing from here uploads it without “${sound}”. To use the sound, download the clip and upload it from the YouTube app with Add sound.`,
      musicTitle: "Check the music rights",
      musicBody:
        "Music you don't own can get this Short claimed or muted by YouTube's Content ID. Nimbus doesn't check tracks.",
      schedule: "Schedule for later",
      publishAt: "Publish at",
      submitSchedule: "Schedule on YouTube",
      submit: "Publish to YouTube",
      uploadsTo: (channel: string) => `Uploads to ${channel}.`,
      uploads: "Uploads the rendered clip.",
    },
    transcript: {
      video: "Source video",
      speed: "Playback speed",
      timeline: "Timeline",
      legend:
        "Lavender ranges are clips. Select lines in the transcript to make a new one.",
      selectHint: "Click a line, then shift-click another to select a range.",
      selection: (lines: number, start: string, end: string) =>
        `${lines} ${plural("en-US", lines, { one: "line", other: "lines" })} · ${start} → ${end}`,
      tooShort: (seconds: number) => `at least ${seconds} s needed`,
      tooLong: (seconds: number) => `at most ${seconds} s`,
      added: "Clip added",
      label: "Transcript",
      search: "Search transcript",
      searchPlaceholder: (words: number) => `Search ${en.format(words)} words`,
      matches: (shown: number, total: number) =>
        `${shown} of ${total} lines match`,
      summary: (lines: number, words: number, language: string) =>
        `${en.format(lines)} lines · ${en.format(words)} words · ${language}`,
      follow: "Follow playback",
      noMatch: (query: string) => `No lines match “${query}”.`,
      clear: "Clear",
      make: "Make a clip",
      playFrom: (time: string) => `Play from ${time}`,
    },
    audio: {
      heading: "Where the clips are",
      across: (clips: number, duration: string) =>
        `${clips} across ${duration}`,
      label: (silences: number, audience: boolean) =>
        `Loudness over time with ${silences} silent stretches${audience ? " and YouTube replay activity" : ""}`,
      summary: (silences: number, silentShare: number, audience: boolean) =>
        `${silences} ${plural("en-US", silences, { one: "silence", other: "silences" })} · ${silentShare}% silent${audience ? " · top band: most rewatched on YouTube" : ""}`,
    },
  },
  "pt-BR": {
    clipsPage: {
      title: "Cortes",
      emptyTitle: "Nenhum corte ainda",
      emptyFailed:
        "O processamento parou antes de encontrar destaques. Tente de novo pela visão geral.",
      emptyPending: (step: string) =>
        `Os destaques aparecem aqui quando a seleção terminar. Etapa atual: ${step}.`,
    },
    transcriptPage: {
      title: "Transcrição",
      emptyTitle: "Nenhuma transcrição ainda",
      emptyFailed:
        "A transcrição não terminou. Tente o projeto de novo pela visão geral.",
      emptyPending: (step: string) =>
        `A transcrição aparece aqui assim que ficar pronta. Etapa atual: ${step}.`,
      skippedTitle: "A transcrição foi pulada",
      skippedNoKey:
        "Este espaço de trabalho não tem chave do Groq, então a gravação não foi transcrita. Os destaques vieram do áudio e os cortes saem sem legenda.",
      skippedWithKey:
        "Esta gravação foi importada antes de o espaço de trabalho ter uma chave do Groq. Transcreva pela visão geral.",
      skippedRateLimited:
        "O limite de uso do Groq foi atingido, então a gravação não foi transcrita. Os destaques vieram do áudio e os cortes saem sem legenda. Transcreva pela visão geral quando o limite renovar.",
      skippedRejected:
        "O Groq recusou a chave do espaço de trabalho, então a gravação não foi transcrita. Os destaques vieram do áudio e os cortes saem sem legenda.",
      addKey: "Adicionar uma chave nas configurações →",
      checkKey: "Conferir a chave nas configurações →",
      openOverview: "Abrir a visão geral →",
    },
    grid: {
      list: "Cortes",
      score: (score: number) => `Nota ${score}`,
      parts: (count: number) =>
        `${count} ${plural("pt-BR", count, { one: "parte", other: "partes" })}`,
      rendered: "Renderizado",
      rendering: "Renderizando",
      approved: "Aprovado",
      restore: "Restaurar corte",
      reject: "Rejeitar corte",
    },
    status: {
      rejected: (title: string) => `“${title}” rejeitado`,
      undo: "Desfazer",
    },
    bar: {
      approved: (count: number) =>
        `${count} ${plural("pt-BR", count, { one: "aprovado", other: "aprovados" })}`,
      rendered: (count: number) =>
        `${count} ${plural("pt-BR", count, { one: "renderizado", other: "renderizados" })}`,
      toReview: (count: number) => `${count} para revisar`,
      empty: "Nenhum corte ainda",
      onlyApproved: "Só cortes aprovados são renderizados.",
      onlyApprovedMinutes: (minutes: number) =>
        `Só cortes aprovados são renderizados. Cerca de ${minutes} ${plural("pt-BR", minutes, { one: "minuto", other: "minutos" })} de renderização.`,
      approveAll: (count: number) =>
        plural("pt-BR", count, {
          one: "Aprovar o corte",
          other: `Aprovar todos os ${count}`,
        }),
      approvedToast: (count: number) =>
        `${count} ${plural("pt-BR", count, { one: "corte aprovado", other: "cortes aprovados" })}`,
      downloadAll: "Baixar todos",
      moreExports: "Mais exportações: edição horizontal",
      renderEdit: "Renderizar edição horizontal",
      renderingEditToast: "Renderizando a edição",
      downloadEdit: (duration: string) => `Baixar edição (${duration})`,
      renderApproved: "Renderizar cortes aprovados",
      renderingClips: (count: number) =>
        `Renderizando ${count} ${cortes(count)}`,
      cancelledClips: "Renderização dos cortes cancelada",
      renderingEdit: "Renderizando a edição horizontal",
      cancelledEdit: "Renderização da edição cancelada",
    },
    list: {
      filter: "Filtrar cortes",
      filters: {
        all: "Todos",
        todo: "Para revisar",
        approved: "Aprovados",
        rejected: "Rejeitados",
      },
      sort: { best: "Melhores primeiro", time: "Em ordem" },
      finding: "Buscando destaques…",
      findMore: "Buscar mais destaques",
      findingToast: "Buscando mais destaques",
      empty: "Nada por aqui agora.",
      hint: "Clique em um corte para abrir no editor.",
      hintApprove: "aprovar",
      hintReject: "rejeitar",
      hintNext: "próximo",
      timeline: "Cortes na gravação",
    },
    stats: {
      label: "Estatísticas do YouTube",
      removed: "Removido do YouTube",
      views: (count: number) =>
        `${pt.format(count)} ${plural("pt-BR", count, { one: "visualização", other: "visualizações" })}`,
      likes: (count: number) =>
        `${pt.format(count)} ${plural("pt-BR", count, { one: "curtida", other: "curtidas" })}`,
      comments: (count: number) =>
        `${pt.format(count)} ${plural("pt-BR", count, { one: "comentário", other: "comentários" })}`,
      averageView: (seconds: number) =>
        `média de ${ptTenths.format(seconds)} s por visualização`,
      averageWatched: (percent: number) => `${percent}% assistido em média`,
      retention:
        "Retenção: parcela do público que continua assistindo ao longo do corte",
      noRetention: "O YouTube ainda não liberou a curva de retenção",
      empty: "Ainda sem estatísticas",
      early: "Os dados ainda estão chegando",
      refreshing: "Atualizando…",
      refresh: "Atualizar estatísticas",
    },
    preview: {
      label: "Prévia vertical com legendas",
      captionPosition: "Posição da legenda",
      captionsPosition: (lane: number) => `Posição das legendas ${lane}`,
    },
    exportMenu: {
      quality: {
        draft: "Rascunho",
        standard: "Padrão",
        high: "Alta",
      },
      seconds: (seconds: number) => `${ptTenths.format(seconds)} s`,
      justNow: "agora mesmo",
      minutesAgo: (minutes: number) => `há ${minutes} min`,
      hoursAgo: (hours: number) => `há ${hours} h`,
      daysAgo: (days: number) => `há ${days} d`,
      rendering: (percent: number) => `Renderizando ${percent}%`,
      queued: "Na fila para renderizar",
      failed: "Falha na renderização",
      outdated: "Editado desde a última renderização",
      rendered: "Renderizado",
      notRendered: "Não renderizado",
      render: "Renderizar",
      rerender: "Renderizar de novo",
      more: "Mais opções de exportação",
      lastRender: (ago: string) => `Última renderização · ${ago}`,
      notRenderedYet: "Ainda não renderizado",
      watch: "Assistir à última renderização",
      download: "Baixar a última renderização",
      published: "Publicado no YouTube",
      live: "No ar",
      publishFailedRetry: "Falha ao publicar · Tentar de novo",
      publishAgain: "Publicar de novo…",
      publish: "Publicar no YouTube…",
      editedSincePublish: "Editado desde a publicação",
      renderQuality: (quality: string) =>
        `Qualidade da renderização: ${quality}`,
      watchTitle: "Última renderização",
      watchDescription: "O arquivo que é baixado e publicado.",
      video: "Corte renderizado",
    },
    publication: {
      published: "Publicado",
      newTab: "(abre em uma nova aba)",
      failed: "Falha ao publicar",
      waitingQuota: "Aguardando o limite diário do YouTube",
      publishing: (progress?: number) =>
        progress === undefined ? "Publicando…" : `Publicando… ${progress}%`,
    },
    publish: {
      privacy: {
        public: "Público",
        unlisted: "Não listado",
        private: "Privado",
      },
      blocked: {
        render: "Renderize a última edição primeiro",
        connect: "Conecte o YouTube em Configurações › Canais conectados",
        reconnect: "Reconecte o YouTube em Configurações › Canais conectados",
        limit: "O limite diário de publicações do seu plano foi atingido",
      },
      futureTime: "Escolha um horário de publicação no futuro",
      invalid: "Confira os dados da publicação",
      scheduledToast: "Agendado no YouTube",
      publishingToast: "Publicando no YouTube",
      title: "Título",
      description: "Descrição",
      tags: "Tags",
      tagsHint: "Separe as tags com vírgulas.",
      privacyLabel: "Privacidade",
      scheduledHint: "Vídeos agendados ficam privados até irem ao ar.",
      soundTitle: "Este corte tem um som para adicionar",
      soundBody: (sound: string) =>
        `Publicar por aqui envia o corte sem “${sound}”. Para usar o som, baixe o corte e envie pelo app do YouTube com Adicionar som.`,
      musicTitle: "Confira os direitos da música",
      musicBody:
        "Música que não é sua pode fazer este Short receber uma reivindicação ou ser silenciado pelo Content ID do YouTube. O nimbus não verifica as faixas.",
      schedule: "Agendar para depois",
      publishAt: "Publicar em",
      submitSchedule: "Agendar no YouTube",
      submit: "Publicar no YouTube",
      uploadsTo: (channel: string) => `Envia para ${channel}.`,
      uploads: "Envia o corte renderizado.",
    },
    transcript: {
      video: "Vídeo original",
      speed: "Velocidade de reprodução",
      timeline: "Linha do tempo",
      legend:
        "Os trechos em lavanda são cortes. Selecione linhas da transcrição para criar um novo.",
      selectHint:
        "Clique em uma linha e, com Shift, em outra para selecionar um trecho.",
      selection: (lines: number, start: string, end: string) =>
        `${lines} ${plural("pt-BR", lines, { one: "linha", other: "linhas" })} · ${start} → ${end}`,
      tooShort: (seconds: number) => `mínimo de ${seconds} s`,
      tooLong: (seconds: number) => `máximo de ${seconds} s`,
      added: "Corte adicionado",
      label: "Transcrição",
      search: "Buscar na transcrição",
      searchPlaceholder: (words: number) =>
        `Buscar em ${pt.format(words)} ${plural("pt-BR", words, { one: "palavra", other: "palavras" })}`,
      matches: (shown: number, total: number) =>
        `${shown} de ${total} ${plural("pt-BR", total, { one: "linha", other: "linhas" })} com resultado`,
      summary: (lines: number, words: number, language: string) =>
        `${pt.format(lines)} ${plural("pt-BR", lines, { one: "linha", other: "linhas" })} · ${pt.format(words)} ${plural("pt-BR", words, { one: "palavra", other: "palavras" })} · ${language}`,
      follow: "Acompanhar a reprodução",
      noMatch: (query: string) => `Nenhuma linha com “${query}”.`,
      clear: "Limpar",
      make: "Criar corte",
      playFrom: (time: string) => `Reproduzir a partir de ${time}`,
    },
    audio: {
      heading: "Onde estão os cortes",
      across: (clips: number, duration: string) => `${clips} em ${duration}`,
      label: (silences: number, audience: boolean) =>
        `Volume ao longo do tempo com ${silences} ${plural("pt-BR", silences, { one: "trecho", other: "trechos" })} em silêncio${audience ? " e atividade de replay do YouTube" : ""}`,
      summary: (silences: number, silentShare: number, audience: boolean) =>
        `${silences} ${plural("pt-BR", silences, { one: "silêncio", other: "silêncios" })} · ${silentShare}% em silêncio${audience ? " · barra de cima: trechos mais reassistidos no YouTube" : ""}`,
    },
  },
})
