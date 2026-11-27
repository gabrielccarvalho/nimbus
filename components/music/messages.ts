import { defineMessages } from "@/lib/i18n/messages"

export const music = defineMessages({
  "en-US": {
    upload: {
      button: "Upload a track",
      progress: (percent: number) => `Uploading… ${percent}%`,
      tooLarge: "Music files can be up to 50 MB",
      added: (title: string) => `Added “${title}”`,
    },
    picker: {
      placeholder: "No music",
      description: "Type to search your music, trending songs or YouTube",
      library: "Your music",
      trending: "Trending on YouTube",
      searchResults: (query: string) => `On YouTube for “${query}”`,
      processing: "Processing…",
      unreadable: "Couldn't be read",
      views: (count: string) => `${count} views`,
      empty: "Upload a track or type to search YouTube.",
      noMatch: "No songs match.",
      search: (query: string) => `Search YouTube for “${query}”`,
      searching: "Searching YouTube…",
      trendingLoading: "Loading what's trending on YouTube…",
      trendingNoChannel:
        "Connect YouTube in Settings › Connected channels to pick from what's trending.",
      trendingNoChart: (region: string) =>
        `YouTube has no music chart for ${region}.`,
      trendingNote: (region: string) =>
        `Trending songs are the top music on YouTube in ${region}. They aren't mixed into the render: you add them in the YouTube app.`,
    },
  },
  "pt-BR": {
    upload: {
      button: "Enviar uma faixa",
      progress: (percent: number) => `Enviando… ${percent}%`,
      tooLarge: "Arquivos de música podem ter até 50 MB",
      added: (title: string) => `“${title}” adicionada`,
    },
    picker: {
      placeholder: "Sem música",
      description:
        "Digite para buscar nas suas músicas, nas músicas em alta ou no YouTube",
      library: "Suas músicas",
      trending: "Em alta no YouTube",
      searchResults: (query: string) => `No YouTube para “${query}”`,
      processing: "Processando…",
      unreadable: "Não foi possível ler",
      views: (count: string) => `${count} visualizações`,
      empty: "Envie uma faixa ou digite para buscar no YouTube.",
      noMatch: "Nenhuma música encontrada.",
      search: (query: string) => `Buscar “${query}” no YouTube`,
      searching: "Buscando no YouTube…",
      trendingLoading: "Carregando o que está em alta no YouTube…",
      trendingNoChannel:
        "Conecte o YouTube em Configurações › Canais conectados para escolher entre as músicas em alta.",
      trendingNoChart: (region: string) =>
        `O YouTube não tem ranking de músicas nesta região (${region}).`,
      trendingNote: (region: string) =>
        `As músicas em alta são as mais ouvidas no YouTube nesta região (${region}). Elas não entram na renderização: você adiciona no app do YouTube.`,
    },
  },
})
