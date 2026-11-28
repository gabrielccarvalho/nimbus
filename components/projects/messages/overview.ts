import type { Locale } from "@/lib/i18n/config"
import { defineMessages } from "@/lib/i18n/messages"
import { sourceLabel } from "@/lib/format"

const count = (value: number, one: string, other: string) =>
  `${value} ${value === 1 ? one : other}`

export const overview = defineMessages({
  "en-US": {
    sources: { Upload: "Upload", Link: "Link" } as Record<string, string>,
    settingsSheet: {
      title: "Project settings",
      description:
        "Only this project. Defaults for new projects live in Settings.",
    },
    status: {
      project: {
        downloading: "Downloading",
        uploaded: "Uploaded",
        probing: "Probing",
        transcribing: "Transcribing",
        analyzing: "Analyzing",
        selecting: "Finding highlights",
        ready_for_review: "Ready for review",
        rendering: "Rendering",
        done: "Done",
        failed: "Failed",
        cancelled: "Cancelled",
      },
      stepFailed: {
        downloading: "Downloading failed",
        uploaded: "Uploaded failed",
        probing: "Probing failed",
        transcribing: "Transcribing failed",
        analyzing: "Analyzing failed",
        selecting: "Finding highlights failed",
        ready_for_review: "Ready for review failed",
        rendering: "Rendering failed",
        done: "Done failed",
        failed: "Failed failed",
        cancelled: "Cancelled failed",
      },
      clip: {
        candidate: "To review",
        approved: "Approved",
        rejected: "Rejected",
        rendering: "Rendering",
        rendered: "Rendered",
        failed: "Render failed",
      },
      needsYou: "Needs you",
      pasteHighlights: "Paste highlights",
      toReview: (clips: number) => `${clips} to review`,
      ready: "Ready",
      approveToRender: "Approve clips to render",
    },
    grid: {
      recordings: "Recordings",
      filterRecordings: "Filter recordings",
      filters: {
        all: "All",
        needs: "Needs you",
        processing: "Processing",
        ready: "Ready",
        done: "Exported",
      },
      sorts: {
        recent: "Most recent",
        oldest: "Oldest",
        name: "Name",
      },
      clips: (clips: number) => count(clips, "clip", "clips"),
      waiting: "is waiting for you. Paste Claude's highlights to continue.",
      empty: "Nothing here right now.",
    },
    importCard: {
      label: "Import a recording",
      title: "Drop a recording, or paste a link",
      formats: (size: string) =>
        `MP4, MOV, MKV or WebM up to ${size}. YouTube, Twitch VODs and most sites yt-dlp supports.`,
      form: "Import from link",
      linkLabel: "Paste a video link",
      submit: "Import",
      browse: "Browse files",
      thisImport: "This import",
      highlights: "Highlights",
      defaultOption: (name: string) => `Default · ${name}`,
      rights: "Only import videos you own or have the rights to use.",
      started: "Download started",
    },
    uploader: {
      rejections: {
        type: "Upload an MP4, MOV, MKV or WebM video",
        size: "This file is larger than the upload limit",
        count: "Upload one video at a time",
      },
      complete: "Upload complete. Processing started.",
      uploading: (fileName: string) => `Uploading ${fileName}`,
    },
    header: {
      back: "Back to projects",
      imported: (day: string) => `imported ${day}`,
      sections: "Project sections",
      overview: "Overview",
      transcript: "Transcript",
      clips: "Clips",
      openSource: "Open source video",
      more: "Project settings and more",
      settings: "Project settings",
      delete: "Delete project",
    },
    nextStep: {
      yourTurn: "Your turn",
      pasteTitle: "Paste Claude's highlights to continue.",
      pasteBody:
        "Copy the prompt into Claude, then paste its answer back. Nimbus takes it from there.",
      openPrompt: "Open the prompt",
      failed: "This step failed",
      unknownError: "Unknown error",
      retrying: "Retrying",
      rendered: "Rendered. Download the clips you approved.",
      toReview: (clips: number) =>
        `${clips} ${clips === 1 ? "clip is" : "clips are"} ready to review.`,
      reviewed: "Every clip is reviewed.",
      approveHint: "Approve the ones you like; only approved clips render.",
      openClips: "Open clips",
      reviewClips: "Review clips",
    },
    pipeline: {
      title: "Pipeline",
      soFar: (duration: string) => `${duration} so far`,
      cancelled: "Cancelled",
      progress: "Pipeline progress",
      download: "Download",
      steps: {
        upload: "Upload",
        probe: "Read the video",
        transcribe: "Transcribe",
        analyze: "Analyze audio",
        select: "Find highlights",
        review: "Review clips",
        render: "Render",
      } as Record<string, string>,
      jobs: {
        download: "Downloading",
        probe: "Reading the video",
        transcribe: "Transcribing",
        analyze: "Analyzing audio",
        select: "Finding highlights",
        render_clip: "Rendering clip",
        render_edit: "Rendering edit",
      } as Record<string, string>,
      waitingForYou: "Waiting for you",
      addTranscriptionKey: "To transcribe, add a key in Settings →",
      transcribeNow: "Transcribe now",
      checkTranscriptionKey: "Check the key in Settings →",
      waitingForWorker: "Waiting for the worker…",
      starting: "Starting…",
      elapsed: (duration: string) => `${duration} elapsed`,
      remaining: (duration: string) => `about ${duration} left`,
      states: {
        complete: "completed",
        current: "in progress",
        upcoming: "not started",
        failed: "failed",
        skipped: "skipped",
      },
    },
    stepDetails: {
      fps: (fps: number) => `${fps} fps`,
      transcribed: (words: string, language: string, source?: string) =>
        `${words} words · ${language}${source ? `, ${source}` : ""}`,
      skipped: (reason?: string) =>
        reason ? `Skipped · ${reason}` : "Skipped",
      partial: (words: string, until: string, reason: string) =>
        `${words} words up to ${until} · ${reason}`,
      skipReasons: {
        no_key: "no transcription key",
        rate_limited: "Groq's rate limit was reached",
        rejected: "Groq rejected the key",
        api_error: "Groq stopped answering",
      },
      languageSources: {
        setting: "chosen in settings",
        source: "from the video page",
        detected: "detected",
      } as Record<string, string>,
      silences: (silences: number) =>
        `${count(silences, "silence", "silences")} · loudness peaks marked`,
      selected: {
        anthropic: (clips: number) =>
          `${count(clips, "clip", "clips")} picked and titled by Claude`,
        heuristic: (clips: number) =>
          `${count(clips, "clip", "clips")} picked from the audio and transcript`,
        manual: (clips: number) =>
          `${count(clips, "clip", "clips")} pasted from Claude`,
      },
      review: "Approve the ones you want rendered",
      qualities: {
        draft: "Draft",
        standard: "Standard",
        high: "High",
      } as Record<string, string>,
      render: (quality: string) => `Approved clips only · ${quality} quality`,
    },
    stepDetail: {
      downloaded: (done: string, total: string | null) =>
        total ? `${done} of ${total}` : done,
      perSecond: (size: string) => `${size}/s`,
      left: (duration: string) => `${duration} left`,
      extracting: "Extracting the audio",
      skipping: {
        no_key: "No transcription key, skipping",
        rate_limited: "Groq's rate limit was reached, skipping",
        rejected: "Groq rejected the key, skipping",
        api_error: "Groq stopped answering, skipping",
      },
      detecting: "Listening for the spoken language",
      transcribingIn: (language: string) => `Transcribing in ${language}`,
      transcribing: "Transcribing",
      languageSources: {
        setting: "chosen in settings",
        source: "from the video page",
        detected: "detected",
        whisper: "detected by whisper",
      } as Record<string, string>,
      words: (words: string) => `${words} words`,
      perMinute: (words: number) => `${words} per minute`,
      at: (time: string) => `at ${time}`,
      latestWords: "Latest transcribed words",
      analyzed: (done: string, total: string) => `${done} of ${total} analyzed`,
      silencesSoFar: (silences: number) =>
        `${count(silences, "silence", "silences")} so far`,
      loudnessSoFar: "Loudness analyzed so far",
      candidatesFound: (candidates: number) =>
        `${count(candidates, "candidate", "candidates")} found`,
      partsRead: (done: number, total: number) =>
        `${done} of ${total} parts of the transcript read`,
      candidatesSoFar: "Candidates found so far",
      rendering: "Clips being rendered",
      renderingClip: (title: string) => `Rendering ${title}`,
      done: "Done",
      failed: "Failed",
      waiting: "Waiting",
    },
    settingsForm: {
      rerun: {
        transcribe: {
          title: "Transcribe again?",
          description:
            "The language or voice track changed. Transcribing again also finds new highlights; approved and rendered clips are kept.",
          action: "Transcribe again",
        },
        select: {
          title: "Find highlights again?",
          description:
            "Highlight options changed. Candidates are replaced; approved and rendered clips are kept.",
          action: "Find highlights again",
        },
        render: {
          title: "Render clips again?",
          description:
            "Caption or quality options changed for clips already rendered.",
          action: "Render again",
        },
      },
      languageSources: {
        setting: "chosen in settings",
        source: "from the video's page",
        detected: "detected",
        whisper: "detected by Whisper",
      } as Record<string, string>,
      track: (position: number) => `Track ${position}`,
      mono: "mono",
      stereo: "stereo",
      channels: (channels: number) => `${channels} ch`,
      transcribedAs: (language: string, source?: string) =>
        `Transcribed as ${language}${source ? ` (${source})` : ""}.`,
      pageSays: (language: string) =>
        `The video's page says ${language}; that's used when set to detect.`,
      saved: "Project settings saved",
      transcription: "Transcription",
      voiceTrack: "Voice track",
      defaultTrack: "Default track",
      tracksHint: (tracks: number) =>
        `This recording has ${tracks} audio tracks. Pick the one with only your microphone so game dialogue isn't transcribed. Loudness still uses the full mix.`,
      highlights: "Highlights",
      captions: "Captions",
      rendering: "Rendering",
      renderingHint: "Hardware encoding is set for all projects in Settings.",
      save: "Save project settings",
      running: "Settings can be changed once the current step finishes.",
    },
    deleteDialog: {
      trigger: "Delete project",
      title: (name: string) => `Delete “${name}”?`,
      description:
        "The source video, transcript, clips and renders are removed from disk. This can't be undone.",
      deleting: "Deleting…",
      deleted: (name: string) => `Deleted “${name}”`,
    },
    sourcePreview: {
      play: "Play source video",
    },
    manualSelection: {
      title: "Pick highlights manually",
      description:
        "Paste this prompt into any chat assistant, then paste its JSON reply below. The same length and overlap rules apply as for automatic selection.",
      prompt: "Prompt",
      copied: "Prompt copied",
      copyFailed: "Couldn't copy. Select the text and copy it instead.",
      copy: "Copy prompt",
      added: (clips: number) => `Added ${count(clips, "clip", "clips")}`,
      reply: "JSON reply",
      adding: "Adding clips…",
      add: "Add clips",
    },
    layout: {
      mode: "Mode",
      modes: {
        "cam-top": {
          label: "Webcam on top",
          description: "A webcam strip, gameplay below",
        },
        "split-50": {
          label: "Even split",
          description: "Webcam and gameplay, half each",
        },
        "no-cam-fill": {
          label: "Fill, no webcam",
          description: "Gameplay cropped to fill the frame",
        },
        "no-cam-blur-fill": {
          label: "Fit, no webcam",
          description: "The whole frame over a blurred copy",
        },
      },
      camPosition: "Webcam goes",
      top: "On top",
      bottom: "At the bottom",
      gameplayRegion: "Gameplay region",
    },
    captionStyle: {
      style: "Style",
      presets: {
        punch: "Punch",
        clean: "Clean",
        boxed: "Boxed",
      } as Record<string, string>,
      sample: "Clip",
      sampleHighlighted: "this",
      position: "Position",
      positions: {
        auto: "Auto",
        top: "Top",
        middle: "Middle",
        bottom: "Bottom",
        custom: "Custom",
      },
      dragHint: "Or drag the caption in the preview.",
      font: "Font",
      notInstalled: "Not installed",
      size: "Size",
      wordsPerCaption: "Words per caption",
      uppercase: "Uppercase",
      highlight: "Highlight the spoken word",
      preview: "Caption preview",
      previewSample: "No way he just clipped that",
      previewPosition: "Caption position",
    },
    page: {
      title: "Project",
      topPicks: "Top picks",
      all: (clips: number) => `All ${clips}`,
      score: (score: number) => `Score ${score}`,
    },
    notFound: {
      title: "Project not found",
      description: "It may have been deleted. Head back to your projects.",
      action: "All projects",
    },
  },
  "pt-BR": {
    sources: { Upload: "Envio", Link: "Link" },
    settingsSheet: {
      title: "Configurações do projeto",
      description:
        "Só este projeto. Os padrões para novos projetos ficam em Configurações.",
    },
    status: {
      project: {
        downloading: "Baixando",
        uploaded: "Enviado",
        probing: "Lendo o vídeo",
        transcribing: "Transcrevendo",
        analyzing: "Analisando",
        selecting: "Buscando destaques",
        ready_for_review: "Pronto para revisão",
        rendering: "Renderizando",
        done: "Concluído",
        failed: "Falhou",
        cancelled: "Cancelado",
      },
      stepFailed: {
        downloading: "Falha ao baixar",
        uploaded: "Falha no envio",
        probing: "Falha ao ler o vídeo",
        transcribing: "Falha ao transcrever",
        analyzing: "Falha ao analisar",
        selecting: "Falha ao buscar destaques",
        ready_for_review: "Falha na revisão",
        rendering: "Falha ao renderizar",
        done: "Falhou",
        failed: "Falhou",
        cancelled: "Falhou",
      },
      clip: {
        candidate: "Para revisar",
        approved: "Aprovado",
        rejected: "Rejeitado",
        rendering: "Renderizando",
        rendered: "Renderizado",
        failed: "Falha ao renderizar",
      },
      needsYou: "Precisa de você",
      pasteHighlights: "Colar destaques",
      toReview: (clips: number) => `${clips} para revisar`,
      ready: "Pronto",
      approveToRender: "Aprove cortes para renderizar",
    },
    grid: {
      recordings: "Gravações",
      filterRecordings: "Filtrar gravações",
      filters: {
        all: "Todos",
        needs: "Precisa de você",
        processing: "Processando",
        ready: "Pronto",
        done: "Exportado",
      },
      sorts: {
        recent: "Mais recentes",
        oldest: "Mais antigos",
        name: "Nome",
      },
      clips: (clips: number) => count(clips, "corte", "cortes"),
      waiting:
        "está esperando você. Cole os destaques do Claude para continuar.",
      empty: "Nada por aqui agora.",
    },
    importCard: {
      label: "Importar uma gravação",
      title: "Solte uma gravação ou cole um link",
      formats: (size: string) =>
        `MP4, MOV, MKV ou WebM de até ${size}. YouTube, VODs da Twitch e a maioria dos sites que o yt-dlp suporta.`,
      form: "Importar por link",
      linkLabel: "Cole o link de um vídeo",
      submit: "Importar",
      browse: "Procurar arquivos",
      thisImport: "Esta importação",
      highlights: "Destaques",
      defaultOption: (name: string) => `Padrão · ${name}`,
      rights: "Importe só vídeos que são seus ou que você tem direito de usar.",
      started: "Download iniciado",
    },
    uploader: {
      rejections: {
        type: "Envie um vídeo MP4, MOV, MKV ou WebM",
        size: "Este arquivo passa do limite de envio",
        count: "Envie um vídeo por vez",
      },
      complete: "Envio concluído. O processamento começou.",
      uploading: (fileName: string) => `Enviando ${fileName}`,
    },
    header: {
      back: "Voltar aos projetos",
      imported: (day: string) => `importado ${day}`,
      sections: "Seções do projeto",
      overview: "Visão geral",
      transcript: "Transcrição",
      clips: "Cortes",
      openSource: "Abrir o vídeo original",
      more: "Configurações do projeto e mais",
      settings: "Configurações do projeto",
      delete: "Excluir projeto",
    },
    nextStep: {
      yourTurn: "Sua vez",
      pasteTitle: "Cole os destaques do Claude para continuar.",
      pasteBody:
        "Copie o prompt no Claude e cole a resposta aqui. O nimbus cuida do resto.",
      openPrompt: "Abrir o prompt",
      failed: "Esta etapa falhou",
      unknownError: "Erro desconhecido",
      retrying: "Tentando de novo",
      rendered: "Renderizado. Baixe os cortes que você aprovou.",
      toReview: (clips: number) =>
        clips === 1
          ? "1 corte pronto para revisar."
          : `${clips} cortes prontos para revisar.`,
      reviewed: "Todos os cortes foram revisados.",
      approveHint:
        "Aprove os que você curtir; só cortes aprovados são renderizados.",
      openClips: "Abrir cortes",
      reviewClips: "Revisar cortes",
    },
    pipeline: {
      title: "Pipeline",
      soFar: (duration: string) => `${duration} até agora`,
      cancelled: "Cancelado",
      progress: "Progresso do pipeline",
      download: "Baixar",
      steps: {
        upload: "Enviar",
        probe: "Ler o vídeo",
        transcribe: "Transcrever",
        analyze: "Analisar o áudio",
        select: "Buscar destaques",
        review: "Revisar cortes",
        render: "Renderizar",
      },
      jobs: {
        download: "Baixando",
        probe: "Lendo o vídeo",
        transcribe: "Transcrevendo",
        analyze: "Analisando o áudio",
        select: "Buscando destaques",
        render_clip: "Renderizando corte",
        render_edit: "Renderizando edição",
      },
      waitingForYou: "Esperando você",
      addTranscriptionKey:
        "Para transcrever, adicione uma chave nas configurações →",
      transcribeNow: "Transcrever agora",
      checkTranscriptionKey: "Confira a chave nas configurações →",
      waitingForWorker: "Aguardando na fila…",
      starting: "Iniciando…",
      elapsed: (duration: string) => `${duration} decorridos`,
      remaining: (duration: string) => `faltam cerca de ${duration}`,
      states: {
        complete: "concluída",
        current: "em andamento",
        upcoming: "não iniciada",
        failed: "falhou",
        skipped: "pulada",
      },
    },
    stepDetails: {
      fps: (fps: number) => `${fps} fps`,
      transcribed: (words: string, language: string, source?: string) =>
        `${words} palavras · ${language}${source ? `, ${source}` : ""}`,
      skipped: (reason?: string) => (reason ? `Pulada · ${reason}` : "Pulada"),
      partial: (words: string, until: string, reason: string) =>
        `${words} palavras até ${until} · ${reason}`,
      skipReasons: {
        no_key: "sem chave de transcrição",
        rate_limited: "o limite de uso do Groq foi atingido",
        rejected: "o Groq recusou a chave",
        api_error: "o Groq parou de responder",
      },
      languageSources: {
        setting: "escolhido nas configurações",
        source: "da página do vídeo",
        detected: "detectado",
      },
      silences: (silences: number) =>
        `${count(silences, "silêncio", "silêncios")} · picos de volume marcados`,
      selected: {
        anthropic: (clips: number) =>
          clips === 1
            ? "1 corte escolhido e titulado pelo Claude"
            : `${clips} cortes escolhidos e titulados pelo Claude`,
        heuristic: (clips: number) =>
          clips === 1
            ? "1 corte escolhido pelo áudio e pela transcrição"
            : `${clips} cortes escolhidos pelo áudio e pela transcrição`,
        manual: (clips: number) =>
          clips === 1
            ? "1 corte colado do Claude"
            : `${clips} cortes colados do Claude`,
      },
      review: "Aprove os que você quer renderizar",
      qualities: {
        draft: "rascunho",
        standard: "padrão",
        high: "alta",
      },
      render: (quality: string) => `Só cortes aprovados · qualidade ${quality}`,
    },
    stepDetail: {
      downloaded: (done: string, total: string | null) =>
        total ? `${done} de ${total}` : done,
      perSecond: (size: string) => `${size}/s`,
      left: (duration: string) => `faltam ${duration}`,
      extracting: "Extraindo o áudio",
      skipping: {
        no_key: "Sem chave de transcrição, pulando",
        rate_limited: "O limite de uso do Groq foi atingido, pulando",
        rejected: "O Groq recusou a chave, pulando",
        api_error: "O Groq parou de responder, pulando",
      },
      detecting: "Ouvindo para descobrir o idioma falado",
      transcribingIn: (language: string) => `Transcrevendo em ${language}`,
      transcribing: "Transcrevendo",
      languageSources: {
        setting: "escolhido nas configurações",
        source: "da página do vídeo",
        detected: "detectado",
        whisper: "detectado pelo Whisper",
      },
      words: (words: string) => `${words} palavras`,
      perMinute: (words: number) => `${words} por minuto`,
      at: (time: string) => `em ${time}`,
      latestWords: "Últimas palavras transcritas",
      analyzed: (done: string, total: string) =>
        `${done} de ${total} analisados`,
      silencesSoFar: (silences: number) =>
        `${count(silences, "silêncio", "silêncios")} até agora`,
      loudnessSoFar: "Volume analisado até agora",
      candidatesFound: (candidates: number) =>
        candidates === 1
          ? "1 candidato encontrado"
          : `${candidates} candidatos encontrados`,
      partsRead: (done: number, total: number) =>
        `${done} de ${total} partes da transcrição lidas`,
      candidatesSoFar: "Candidatos encontrados até agora",
      rendering: "Cortes sendo renderizados",
      renderingClip: (title: string) => `Renderizando ${title}`,
      done: "Concluído",
      failed: "Falhou",
      waiting: "Na fila",
    },
    settingsForm: {
      rerun: {
        transcribe: {
          title: "Transcrever de novo?",
          description:
            "O idioma ou a faixa de voz mudou. Transcrever de novo também busca novos destaques; cortes aprovados e renderizados são mantidos.",
          action: "Transcrever de novo",
        },
        select: {
          title: "Buscar destaques de novo?",
          description:
            "As opções de destaque mudaram. Os candidatos são substituídos; cortes aprovados e renderizados são mantidos.",
          action: "Buscar destaques de novo",
        },
        render: {
          title: "Renderizar os cortes de novo?",
          description:
            "As opções de legenda ou qualidade mudaram para cortes já renderizados.",
          action: "Renderizar de novo",
        },
      },
      languageSources: {
        setting: "escolhido nas configurações",
        source: "da página do vídeo",
        detected: "detectado",
        whisper: "detectado pelo Whisper",
      },
      track: (position: number) => `Faixa ${position}`,
      mono: "mono",
      stereo: "estéreo",
      channels: (channels: number) => `${channels} canais`,
      transcribedAs: (language: string, source?: string) =>
        `Transcrito em ${language}${source ? ` (${source})` : ""}.`,
      pageSays: (language: string) =>
        `A página do vídeo diz ${language}; é o que vale quando o idioma está em detectar.`,
      saved: "Configurações do projeto salvas",
      transcription: "Transcrição",
      voiceTrack: "Faixa de voz",
      defaultTrack: "Faixa padrão",
      tracksHint: (tracks: number) =>
        `Esta gravação tem ${tracks} faixas de áudio. Escolha a que tem só o seu microfone para não transcrever as falas do jogo. O volume continua usando a mixagem completa.`,
      highlights: "Destaques",
      captions: "Legendas",
      rendering: "Renderização",
      renderingHint:
        "A codificação por hardware vale para todos os projetos e fica em Configurações.",
      save: "Salvar configurações do projeto",
      running: "Dá para mudar as configurações quando a etapa atual terminar.",
    },
    deleteDialog: {
      trigger: "Excluir projeto",
      title: (name: string) => `Excluir “${name}”?`,
      description:
        "O vídeo original, a transcrição, os cortes e as renderizações são removidos do disco. Não dá para desfazer.",
      deleting: "Excluindo…",
      deleted: (name: string) => `“${name}” excluído`,
    },
    sourcePreview: {
      play: "Reproduzir o vídeo original",
    },
    manualSelection: {
      title: "Escolher destaques manualmente",
      description:
        "Cole este prompt em qualquer assistente de chat e depois cole a resposta em JSON abaixo. Valem as mesmas regras de duração e sobreposição da seleção automática.",
      prompt: "Prompt",
      copied: "Prompt copiado",
      copyFailed: "Não deu para copiar. Selecione o texto e copie.",
      copy: "Copiar prompt",
      added: (clips: number) =>
        clips === 1 ? "1 corte adicionado" : `${clips} cortes adicionados`,
      reply: "Resposta em JSON",
      adding: "Adicionando cortes…",
      add: "Adicionar cortes",
    },
    layout: {
      mode: "Modo",
      modes: {
        "cam-top": {
          label: "Webcam em cima",
          description: "Uma faixa de webcam, gameplay embaixo",
        },
        "split-50": {
          label: "Meio a meio",
          description: "Webcam e gameplay, metade cada",
        },
        "no-cam-fill": {
          label: "Preencher, sem webcam",
          description: "Gameplay recortado para preencher o quadro",
        },
        "no-cam-blur-fill": {
          label: "Ajustar, sem webcam",
          description: "O quadro inteiro sobre uma cópia desfocada",
        },
      },
      camPosition: "A webcam fica",
      top: "Em cima",
      bottom: "Embaixo",
      gameplayRegion: "Área do gameplay",
    },
    captionStyle: {
      style: "Estilo",
      presets: {
        punch: "Impacto",
        clean: "Limpo",
        boxed: "Caixa",
      },
      sample: "Corta",
      sampleHighlighted: "isso",
      position: "Posição",
      positions: {
        auto: "Auto",
        top: "Topo",
        middle: "Meio",
        bottom: "Base",
        custom: "Livre",
      },
      dragHint: "Ou arraste a legenda na prévia.",
      font: "Fonte",
      notInstalled: "Não instalada",
      size: "Tamanho",
      wordsPerCaption: "Palavras por legenda",
      uppercase: "Maiúsculas",
      highlight: "Destacar a palavra falada",
      preview: "Prévia da legenda",
      previewSample: "Não acredito que ele cortou isso",
      previewPosition: "Posição da legenda",
    },
    page: {
      title: "Projeto",
      topPicks: "Melhores destaques",
      all: (clips: number) => `Todos os ${clips}`,
      score: (score: number) => `Nota ${score}`,
    },
    notFound: {
      title: "Projeto não encontrado",
      description: "Ele pode ter sido excluído. Volte para os seus projetos.",
      action: "Todos os projetos",
    },
  },
})

export function localSourceLabel(
  url: string | null | undefined,
  locale: Locale
) {
  const label = sourceLabel(url)
  return overview[locale].sources[label] ?? label
}
