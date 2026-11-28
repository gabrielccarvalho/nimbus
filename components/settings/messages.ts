import type { PlanId } from "@/features/accounts/schema"
import type { Niche } from "@/features/highlights/niches"
import type { RenderQuality, SelectorMode } from "@/features/projects/schema"
import type { PrivacyStatus } from "@/features/publishing/schema"
import { defineMessages, plural } from "@/lib/i18n/messages"

type Option = { label: string; description: string }

export const settings = defineMessages({
  "en-US": {
    title: "Settings",
    lede: "Your account, and the workspace your projects live in: its plan, its Claude key and the defaults every new project starts with.",
    soon: "Soon",
    nav: {
      sections: "Settings sections",
      account: "Account",
      profile: "Profile",
      channels: "Connected channels",
      security: "Sign-in & security",
      workspace: "Workspace",
      general: "General",
      plan: "Plan & usage",
      defaults: "Project defaults",
      layout: "Layout",
      captions: "Captions",
      rendering: "Rendering",
      music: "Music",
    },
    profile: {
      title: "Profile",
      memberSince: (date: string) => `Member since ${date}`,
      name: "Name",
      nameSaved: "Name saved",
      email: "Email",
      emailHint: "Used to sign in.",
      languageHint:
        "Saved to your account and applied wherever you sign in. Your clips keep the language of the recording.",
    },
    avatar: {
      unreadable: "That file isn't an image we can read",
      user: {
        upload: "Upload photo",
        change: "Change photo",
        updated: "Photo updated",
        removed: "Photo removed",
      },
      workspace: {
        upload: "Upload logo",
        change: "Change logo",
        updated: "Logo updated",
        removed: "Logo removed",
      },
    },
    workspace: {
      description:
        "Projects, the plan, the Claude key and every default belong to the workspace.",
      name: "Workspace name",
      renamed: "Workspace renamed",
      members: "Members",
      membersHint: "Personal workspace. Inviting people comes later.",
    },
    apiKey: {
      title: "Claude API key",
      hint: "Used by the Claude highlight selector. Stored encrypted.",
      description:
        "Stored encrypted. Only the last four characters are shown again.",
      key: "Key",
      add: "Add key",
      replace: "Replace",
      save: "Save key",
      saved: "Claude API key saved",
      removed: "Claude API key removed",
    },
    groqKey: {
      title: "Groq API key",
      hint: "Transcribes recordings with Whisper on Groq, about $0.04 per audio hour. Without it, transcription is skipped. Stored encrypted.",
      description:
        "Create one at console.groq.com. Stored encrypted. Only the last four characters are shown again.",
      key: "Key",
      add: "Add key",
      replace: "Replace",
      save: "Save key",
      saved: "Groq API key saved",
      removed: "Groq API key removed",
    },
    security: {
      password: "Password",
      lastChanged: (day: string) => `Last changed ${day}`,
      change: "Change",
      connectedAccount: "You sign in with a connected account.",
      changePassword: "Change password",
      changePasswordHint: "Other sessions are signed out.",
      currentPassword: "Current password",
      newPassword: "New password",
      newPasswordHint: "At least 10 characters.",
      passwordChanged: "Password changed. Other sessions were signed out.",
    },
    twoFactor: {
      title: "Two-step verification",
      hint: "A code from your authenticator app at sign-in",
      turnOnTitle: "Turn on two-step verification",
      turnOffTitle: "Turn off two-step verification?",
      confirm: "Confirm with your password.",
      turnOn: "Turn on",
      turnOff: "Turn off",
      scanTitle: "Scan with your authenticator",
      scanDescription:
        "Then enter the 6-digit code it shows. Keep the backup codes somewhere safe; each works once.",
      qrCode: "QR code for your authenticator app",
      secret: "Or enter this key",
      backupCodes: "Backup codes",
      code: "Code",
      on: "Two-step verification is on",
      off: "Two-step verification is off",
    },
    deleteAccount: {
      title: "Delete account",
      hint: "Removes every project, clip and export. This can't be undone.",
      open: "Delete account…",
      confirmTitle: "Delete your account?",
      confirmDescription:
        "Every project, clip and render in your workspace is removed from disk.",
      confirm: "Delete everything",
    },
    sessions: {
      title: "Sessions",
      description: "Everywhere you're signed in.",
      signOutOthers: "Sign out all others",
      signedOutOthers: "Signed out everywhere else",
      device: (browser: string, os: string) => `${browser} on ${os}`,
      unknownDevice: "Unknown device",
      thisDevice: "This device",
      activeNow: "Active now",
      lastActive: (day: string) => `Last active ${day}`,
      signOut: (device: string) => `Sign out ${device}`,
      signedOut: (device: string) => `Signed out ${device}`,
    },
    channels: {
      description:
        "Import VODs without pasting links, and publish approved clips to your channels.",
      notSetUp: "Not set up",
      connected: "Connected",
      needsReconnect: "Needs reconnect",
      connect: "Connect",
      connectChannel: (channel: string) => `Connect ${channel}`,
      reconnect: "Reconnect",
      reconnectChannel: (channel: string) => `Reconnect ${channel}`,
      disconnect: "Disconnect",
      disconnectChannel: (channel: string) => `Disconnect ${channel}`,
      disconnected: (channel: string) => `${channel} disconnected`,
      staleSession: (channel: string) =>
        `Sign out and back in, then disconnect ${channel} again.`,
    },
    plan: {
      names: {
        free: "Free",
        creator: "Creator",
        studio: "Studio",
        admin: "Admin",
      } satisfies Record<PlanId, string> as Record<string, string>,
      adminSummary: (date: string) =>
        `Admin plan · resets ${date}. No limits; usage is still tracked.`,
      summary: (plan: string, date: string) =>
        `${plan} plan · resets ${date}. A render, upload or Claude pick that would go past a limit is refused until then.`,
      renderMinutes: "Render minutes",
      storage: "Storage",
      claudeRuns: "Highlight runs with Claude",
      unlimited: "Unlimited",
      publishesToday: "Publishes today",
      publishes: (used: number, limit: number) => `${used} of ${limit}`,
      noLimit: "No limit",
      billing: {
        title: "Billing",
        creator: (price: string) => `Creator · ${price} a month`,
        creatorPerks:
          "300 render minutes, 100 GB, 40 Claude picks a month and 5 publishes a day. Paid by card through AbacatePay; cancel any time.",
        upgrade: "Upgrade to Creator",
        active: (date: string) => `Renews on ${date}.`,
        ending: (date: string) =>
          `Cancelled. You keep Creator until ${date}, then the workspace moves to Free.`,
        manage: "Manage billing",
        manageHint: "Change the card, see payments or cancel.",
        pending:
          "Payment received. The plan changes as soon as AbacatePay confirms it, usually within a minute.",
      },
    },
    form: {
      sections: {
        defaults: {
          description:
            "Where every new import starts. Imports can override them, and each project keeps its own copy.",
          save: "Save project defaults",
          saved: "Project defaults saved",
        },
        layout: {
          description:
            "How new clips are framed. Each clip looks for the webcam the first time you open it and keeps its own layout.",
          save: "Save layout",
          saved: "Layout saved",
        },
        captions: {
          description:
            "How captions look on new projects. Each project and each clip can still change them.",
          save: "Save captions",
          saved: "Captions saved",
        },
        rendering: {
          description:
            "Quality is the default for new projects. Hardware encoding applies to every render on this machine.",
          save: "Save rendering",
          saved: "Rendering saved",
        },
      },
      noWorker: "No worker online",
      noWorkerHint:
        "Renders and transcriptions wait until a worker is running.",
      hardware: "Hardware encoding",
      hardwareWith: (encoder: string) =>
        `Faster renders with ${encoder}. Output can differ slightly between machines.`,
      hardwareMissing: "No hardware encoder found in this ffmpeg.",
      hardwareOffline: "Available once a worker is online.",
    },
    fields: {
      language: "Spoken language",
      languageAuto: "Detect automatically",
      languageHint:
        "The language the streamer speaks, not the game's. Detection samples several points of the recording.",
      transcriptionOff:
        "Transcription is off until you add a Groq key in Workspace settings. Without it, highlights come from the audio and clips have no captions.",
      niche: "Niche",
      niches: {
        auto: {
          label: "Detect from title",
          description:
            "Guessed from the recording's title. Tells Claude which moments hook viewers in this game.",
        },
        gta: {
          label: "GTA",
          description: "Bugs, physics chaos, chases, crashes and explosions.",
        },
        "open-world": {
          label: "Open world / sandbox",
          description: "Glitches, physics, emergent chaos.",
        },
        horror: { label: "Horror", description: "Jump scares and panic." },
        shooter: {
          label: "Shooter",
          description: "Clutches, multi-kills and rage.",
        },
        racing: {
          label: "Racing",
          description: "Crashes, photo finishes, overtakes.",
        },
        general: {
          label: "General",
          description: "Any game: action and big reactions.",
        },
      } satisfies Record<Niche, Option>,
      selector: "Selector",
      selectors: {
        heuristic: {
          label: "Heuristic",
          description: "Scores loudness, speech density and keywords locally.",
        },
        anthropic: {
          label: "Claude",
          description:
            "Sends the transcript to Claude to pick and title clips.",
        },
        manual: {
          label: "Manual",
          description:
            "Gives you a prompt to paste into any chat, then the reply.",
        },
      } satisfies Record<SelectorMode, Option>,
      claudeKeyMissing:
        "Add a Claude API key in Workspace settings to use Claude.",
      clipMin: "Shortest clip (s)",
      clipMax: "Longest clip (s)",
      clipCount: "Clips to find",
      catchphrases: "Catchphrases",
      catchphrasesHint:
        "One per line. Things the streamer says when something big happens, on top of the usual reactions for the spoken language. Used by the built-in selector.",
      autoEffects: "Auto effects",
      autoEffectsHint:
        "Add full-cam, zoom and shake effects to the moments that call for them. You can edit them per clip.",
      burnIn: "Burn in captions",
      burnInHint: "Word-by-word captions on vertical clips and the edit.",
      captionStyle: "Style",
      captionPresets: {
        punch: "Punch",
        clean: "Clean",
        boxed: "Boxed",
      } as Record<string, string>,
      quality: "Quality",
      qualities: {
        draft: { label: "Draft", description: "Smallest files, fastest." },
        standard: { label: "Standard", description: "Good for uploads." },
        high: { label: "High", description: "Larger files, sharper." },
      } satisfies Record<RenderQuality, Option>,
      publishing: "Publishing",
      privacy: "Privacy",
      privacyOptions: {
        private: "Private",
        unlisted: "Unlisted",
        public: "Public",
      } satisfies Record<PrivacyStatus, string>,
      privacyHint:
        "Where new YouTube uploads start. You can change it before each publish.",
      tags: "Tags",
      tagsHint: "Separated by commas.",
      hashtags: "Hashtags",
      hashtagsHint:
        "Added to the end of every description. #Shorts is always included.",
    },
    library: {
      title: "Music library",
      description:
        "Tracks here can go under any clip in this workspace. MP3, M4A, AAC, WAV, OGG or FLAC, up to 50 MB.",
      emptyTitle: "No music yet",
      emptyDescription: "Upload a track to put it under your clips.",
      trackTitle: "Track title",
      processing: "Processing…",
      processingTrack: (title: string) => `Processing ${title}`,
      unreadable: "This file couldn't be read",
      usage: (count: number) =>
        count === 0
          ? "Not used"
          : `Under ${count} ${plural("en-US", count, { one: "clip", other: "clips" })}`,
      deleteTrack: (title: string) => `Delete ${title}`,
      deleteTitle: (title: string) => `Delete “${title}”?`,
      deleteDescription:
        "The file is removed from this workspace. This can't be undone.",
      deleteConfirm: "Delete track",
      deleted: "Track deleted",
    },
  },
  "pt-BR": {
    title: "Configurações",
    lede: "Sua conta e o workspace onde ficam seus projetos: o plano, a chave do Claude e os padrões de todo projeto novo.",
    soon: "Em breve",
    nav: {
      sections: "Seções das configurações",
      account: "Conta",
      profile: "Perfil",
      channels: "Canais conectados",
      security: "Acesso e segurança",
      workspace: "Workspace",
      general: "Geral",
      plan: "Plano e uso",
      defaults: "Padrões de projeto",
      layout: "Layout",
      captions: "Legendas",
      rendering: "Renderização",
      music: "Música",
    },
    profile: {
      title: "Perfil",
      memberSince: (date: string) => `Membro desde ${date}`,
      name: "Nome",
      nameSaved: "Nome salvo",
      email: "E-mail",
      emailHint: "Usado para entrar.",
      languageHint:
        "Fica salvo na sua conta e vale em qualquer lugar em que você entrar. Seus cortes continuam no idioma da gravação.",
    },
    avatar: {
      unreadable: "Não conseguimos ler esse arquivo como imagem",
      user: {
        upload: "Enviar foto",
        change: "Trocar foto",
        updated: "Foto atualizada",
        removed: "Foto removida",
      },
      workspace: {
        upload: "Enviar logo",
        change: "Trocar logo",
        updated: "Logo atualizado",
        removed: "Logo removido",
      },
    },
    workspace: {
      description:
        "Os projetos, o plano, a chave do Claude e todos os padrões pertencem ao workspace.",
      name: "Nome do workspace",
      renamed: "Workspace renomeado",
      members: "Membros",
      membersHint: "Workspace pessoal. Convidar pessoas vem depois.",
    },
    apiKey: {
      title: "Chave de API do Claude",
      hint: "Usada pelo seletor de destaques com Claude. Fica criptografada.",
      description:
        "Fica criptografada. Só os quatro últimos caracteres aparecem de novo.",
      key: "Chave",
      add: "Adicionar chave",
      replace: "Substituir",
      save: "Salvar chave",
      saved: "Chave de API do Claude salva",
      removed: "Chave de API do Claude removida",
    },
    groqKey: {
      title: "Chave de API do Groq",
      hint: "Transcreve as gravações com o Whisper no Groq, cerca de US$ 0,04 por hora de áudio. Sem ela, a transcrição é pulada. Fica criptografada.",
      description:
        "Crie uma em console.groq.com. Fica criptografada. Só os quatro últimos caracteres aparecem de novo.",
      key: "Chave",
      add: "Adicionar chave",
      replace: "Substituir",
      save: "Salvar chave",
      saved: "Chave de API do Groq salva",
      removed: "Chave de API do Groq removida",
    },
    security: {
      password: "Senha",
      lastChanged: (day: string) => `Última alteração: ${day}`,
      change: "Alterar",
      connectedAccount: "Você entra com uma conta conectada.",
      changePassword: "Alterar senha",
      changePasswordHint: "As outras sessões são encerradas.",
      currentPassword: "Senha atual",
      newPassword: "Nova senha",
      newPasswordHint: "Pelo menos 10 caracteres.",
      passwordChanged: "Senha alterada. As outras sessões foram encerradas.",
    },
    twoFactor: {
      title: "Verificação em duas etapas",
      hint: "Um código do seu app autenticador na hora de entrar",
      turnOnTitle: "Ativar a verificação em duas etapas",
      turnOffTitle: "Desativar a verificação em duas etapas?",
      confirm: "Confirme com sua senha.",
      turnOn: "Ativar",
      turnOff: "Desativar",
      scanTitle: "Escaneie com seu app autenticador",
      scanDescription:
        "Depois digite o código de 6 dígitos que ele mostrar. Guarde os códigos de backup em um lugar seguro; cada um funciona uma vez.",
      qrCode: "QR code para o seu app autenticador",
      secret: "Ou digite esta chave",
      backupCodes: "Códigos de backup",
      code: "Código",
      on: "Verificação em duas etapas ativada",
      off: "Verificação em duas etapas desativada",
    },
    deleteAccount: {
      title: "Excluir conta",
      hint: "Remove todos os projetos, cortes e exportações. Não dá para desfazer.",
      open: "Excluir conta…",
      confirmTitle: "Excluir sua conta?",
      confirmDescription:
        "Todos os projetos, cortes e renderizações do seu workspace são removidos do disco.",
      confirm: "Excluir tudo",
    },
    sessions: {
      title: "Sessões",
      description: "Todos os lugares em que você entrou.",
      signOutOthers: "Encerrar todas as outras",
      signedOutOthers: "Todas as outras sessões foram encerradas",
      device: (browser: string, os: string) => `${browser} no ${os}`,
      unknownDevice: "Dispositivo desconhecido",
      thisDevice: "Este dispositivo",
      activeNow: "Ativa agora",
      lastActive: (day: string) => `Última atividade: ${day}`,
      signOut: (device: string) => `Encerrar sessão em ${device}`,
      signedOut: (device: string) => `Sessão encerrada em ${device}`,
    },
    channels: {
      description:
        "Importe VODs sem colar links e publique os cortes aprovados nos seus canais.",
      notSetUp: "Não configurado",
      connected: "Conectado",
      needsReconnect: "Precisa reconectar",
      connect: "Conectar",
      connectChannel: (channel: string) => `Conectar ${channel}`,
      reconnect: "Reconectar",
      reconnectChannel: (channel: string) => `Reconectar ${channel}`,
      disconnect: "Desconectar",
      disconnectChannel: (channel: string) => `Desconectar ${channel}`,
      disconnected: (channel: string) => `${channel} desconectado`,
      staleSession: (channel: string) =>
        `Saia e entre de novo, depois desconecte ${channel} outra vez.`,
    },
    plan: {
      names: {
        free: "Grátis",
        creator: "Creator",
        studio: "Studio",
        admin: "Admin",
      },
      adminSummary: (date: string) =>
        `Plano Admin · reinicia em ${date} · sem limites; o uso continua sendo registrado.`,
      summary: (plan: string, date: string) =>
        `Plano ${plan} · reinicia em ${date}. Até lá, uma renderização, um envio ou uma seleção com o Claude que passe de um limite é recusada.`,
      renderMinutes: "Minutos de renderização",
      storage: "Armazenamento",
      claudeRuns: "Buscas de destaques com o Claude",
      unlimited: "Ilimitado",
      publishesToday: "Publicações hoje",
      publishes: (used: number, limit: number) => `${used} de ${limit}`,
      noLimit: "Sem limite",
      billing: {
        title: "Cobrança",
        creator: (price: string) => `Creator · ${price} por mês`,
        creatorPerks:
          "300 minutos de renderização, 100 GB, 40 seleções com o Claude por mês e 5 publicações por dia. Pago no cartão pela AbacatePay; cancele quando quiser.",
        upgrade: "Assinar o Creator",
        active: (date: string) => `Renova em ${date}.`,
        ending: (date: string) =>
          `Cancelado. Você fica no Creator até ${date}; depois o workspace volta para o Grátis.`,
        manage: "Gerenciar cobrança",
        manageHint: "Troque o cartão, veja os pagamentos ou cancele.",
        pending:
          "Pagamento recebido. O plano muda assim que a AbacatePay confirmar, em geral em menos de um minuto.",
      },
    },
    form: {
      sections: {
        defaults: {
          description:
            "O ponto de partida de toda importação. Cada importação pode mudar esses padrões, e cada projeto guarda a própria cópia.",
          save: "Salvar padrões de projeto",
          saved: "Padrões de projeto salvos",
        },
        layout: {
          description:
            "Como os novos cortes são enquadrados. Cada corte procura a webcam na primeira vez que você abre e guarda o próprio layout.",
          save: "Salvar layout",
          saved: "Layout salvo",
        },
        captions: {
          description:
            "A aparência das legendas nos novos projetos. Cada projeto e cada corte ainda pode mudar.",
          save: "Salvar legendas",
          saved: "Legendas salvas",
        },
        rendering: {
          description:
            "A qualidade é o padrão dos novos projetos. A codificação por hardware vale para toda renderização nesta máquina.",
          save: "Salvar renderização",
          saved: "Renderização salva",
        },
      },
      noWorker: "Nenhum worker online",
      noWorkerHint:
        "Renderizações e transcrições esperam até um worker estar rodando.",
      hardware: "Codificação por hardware",
      hardwareWith: (encoder: string) =>
        `Renderizações mais rápidas com ${encoder}. O resultado pode variar um pouco entre máquinas.`,
      hardwareMissing:
        "Nenhum codificador por hardware encontrado neste ffmpeg.",
      hardwareOffline: "Disponível quando um worker estiver online.",
    },
    fields: {
      language: "Idioma falado",
      languageAuto: "Detectar automaticamente",
      languageHint:
        "O idioma que o streamer fala, não o do jogo. A detecção analisa vários trechos da gravação.",
      transcriptionOff:
        "A transcrição fica desligada até você adicionar uma chave do Groq nas configurações do espaço de trabalho. Sem ela, os destaques vêm do áudio e os cortes saem sem legenda.",
      niche: "Nicho",
      niches: {
        auto: {
          label: "Detectar pelo título",
          description:
            "Deduzido pelo título da gravação. Diz ao Claude quais momentos prendem o público nesse jogo.",
        },
        gta: {
          label: "GTA",
          description:
            "Bugs, física maluca, perseguições, batidas e explosões.",
        },
        "open-world": {
          label: "Mundo aberto / sandbox",
          description: "Glitches, física, caos emergente.",
        },
        horror: { label: "Terror", description: "Sustos e pânico." },
        shooter: {
          label: "Tiro",
          description: "Clutches, multi-kills e rage.",
        },
        racing: {
          label: "Corrida",
          description: "Batidas, chegadas apertadas, ultrapassagens.",
        },
        general: {
          label: "Geral",
          description: "Qualquer jogo: ação e reações fortes.",
        },
      },
      selector: "Seletor",
      selectors: {
        heuristic: {
          label: "Heurístico",
          description:
            "Pontua volume, densidade de fala e palavras-chave localmente.",
        },
        anthropic: {
          label: "Claude",
          description:
            "Envia a transcrição para o Claude escolher e dar título aos cortes.",
        },
        manual: {
          label: "Manual",
          description:
            "Gera um prompt para você colar em qualquer chat e depois trazer a resposta.",
        },
      },
      claudeKeyMissing:
        "Adicione uma chave de API do Claude nas configurações do workspace para usar o Claude.",
      clipMin: "Corte mais curto (s)",
      clipMax: "Corte mais longo (s)",
      clipCount: "Cortes a encontrar",
      catchphrases: "Bordões",
      catchphrasesHint:
        "Um por linha. O que o streamer fala quando acontece algo grande, além das reações comuns do idioma falado. Usados pelo seletor integrado.",
      autoEffects: "Efeitos automáticos",
      autoEffectsHint:
        "Adiciona webcam em tela cheia, zoom e tremor nos momentos que pedem. Dá para editar em cada corte.",
      burnIn: "Gravar legendas no vídeo",
      burnInHint:
        "Legendas palavra por palavra nos cortes verticais e na edição horizontal.",
      captionStyle: "Estilo",
      captionPresets: {
        punch: "Impacto",
        clean: "Limpo",
        boxed: "Caixa",
      },
      quality: "Qualidade",
      qualities: {
        draft: {
          label: "Rascunho",
          description: "Arquivos menores, mais rápido.",
        },
        standard: { label: "Padrão", description: "Bom para publicar." },
        high: { label: "Alta", description: "Arquivos maiores, mais nitidez." },
      },
      publishing: "Publicação",
      privacy: "Privacidade",
      privacyOptions: {
        private: "Privado",
        unlisted: "Não listado",
        public: "Público",
      },
      privacyHint:
        "Como os novos envios ao YouTube começam. Dá para mudar antes de cada publicação.",
      tags: "Tags",
      tagsHint: "Separadas por vírgula.",
      hashtags: "Hashtags",
      hashtagsHint:
        "Adicionadas ao fim de toda descrição. #Shorts sempre entra.",
    },
    library: {
      title: "Biblioteca de músicas",
      description:
        "As faixas daqui podem tocar em qualquer corte deste workspace. MP3, M4A, AAC, WAV, OGG ou FLAC, até 50 MB.",
      emptyTitle: "Nenhuma música ainda",
      emptyDescription: "Envie uma faixa para colocar nos seus cortes.",
      trackTitle: "Título da faixa",
      processing: "Processando…",
      processingTrack: (title: string) => `Processando ${title}`,
      unreadable: "Não foi possível ler este arquivo",
      usage: (count: number) =>
        count === 0
          ? "Sem uso"
          : `Em ${count} ${plural("pt-BR", count, { one: "corte", other: "cortes" })}`,
      deleteTrack: (title: string) => `Excluir ${title}`,
      deleteTitle: (title: string) => `Excluir “${title}”?`,
      deleteDescription:
        "O arquivo é removido deste workspace. Não dá para desfazer.",
      deleteConfirm: "Excluir faixa",
      deleted: "Faixa excluída",
    },
  },
})
