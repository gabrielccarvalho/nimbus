import { defineMessages } from "@/lib/i18n/messages"

export const ui = defineMessages({
  "en-US": {
    combobox: { showOptions: "Show options", clear: "Clear selection" },
    command: {
      title: "Command Palette",
      description: "Search for a command to run...",
    },
    videoPlayer: {
      seek: "Seek",
      play: "Play",
      pause: "Pause",
      mute: "Mute",
      unmute: "Unmute",
    },
    timeline: {
      position: (time: string, duration: string) => `${time} of ${duration}`,
    },
    captionPreview: {
      baseline: (percent: number) => `${percent}% from the top`,
    },
    cropRegion: {
      label: "Crop region",
      role: "crop region",
      description: (left: string, top: string, width: string, height: string) =>
        `Left ${left}, top ${top}, ${width} wide, ${height} tall. Arrow keys move, Alt+arrow keys resize, hold Shift for bigger steps.`,
    },
  },
  "pt-BR": {
    combobox: { showOptions: "Mostrar opções", clear: "Limpar seleção" },
    command: {
      title: "Paleta de comandos",
      description: "Busque um comando para executar...",
    },
    videoPlayer: {
      seek: "Posição",
      play: "Reproduzir",
      pause: "Pausar",
      mute: "Silenciar",
      unmute: "Ativar som",
    },
    timeline: {
      position: (time: string, duration: string) => `${time} de ${duration}`,
    },
    captionPreview: {
      baseline: (percent: number) => `${percent}% a partir do topo`,
    },
    cropRegion: {
      label: "Área de recorte",
      role: "área de recorte",
      description: (left: string, top: string, width: string, height: string) =>
        `Esquerda ${left}, topo ${top}, ${width} de largura, ${height} de altura. As setas movem, Alt+setas redimensionam, segure Shift para passos maiores.`,
    },
  },
})
