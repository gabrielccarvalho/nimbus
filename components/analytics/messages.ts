import { CLAUDE_KEY_MISSING_MESSAGE } from "@/features/accounts/schema"
import { defineMessages, plural } from "@/lib/i18n/messages"

const en = new Intl.NumberFormat("en-US")
const pt = new Intl.NumberFormat("pt-BR")

function visualizacoes(count: number) {
  return `${pt.format(count)} ${plural("pt-BR", count, { one: "visualização", other: "visualizações" })}`
}

export const analytics = defineMessages({
  "en-US": {
    layout: {
      title: "Analytics",
      shortsTitle: "Shorts · Analytics",
      insightsTitle: "Insights · Analytics",
      sections: "Analytics sections",
      overview: "Overview",
      shorts: "Shorts",
      insights: "Insights",
      connectPrompt: "Connect a YouTube channel to see how your Shorts do.",
      connect: "Connect",
      reconnectPrompt: "Reconnect YouTube to keep these numbers up to date.",
      reconnect: "Reconnect",
    },
    period: {
      label: "Period",
      days: (days: number) => `${days} days`,
    },
    overview: {
      dataThrough: (date: string) =>
        `Data through ${date}. YouTube shares numbers 2–3 days late.`,
      fetching: "Fetching your channel's numbers from YouTube…",
      empty: "No views in this period yet.",
      tiles: {
        views: "Views",
        watchHours: "Watch hours",
        netSubscribers: "Net subscribers",
        averageViewDurationS: "Average view duration",
        likes: "Likes",
      },
      viewsPerDay: "Views per day",
      topShorts: "Top Shorts this period",
      noTopShorts: "No Short gained views in this period.",
      untitled: "Untitled Short",
      gained: (views: number) => `+${en.format(views)} views`,
    },
    viewsChart: {
      views: "Views",
      shorts: "Shorts",
      longForm: "Long-form",
      day: "Day",
      showTable: "Show as table",
      summary: (total: number, days: number) =>
        `${en.format(total)} views in the last ${days} days.`,
      splitSummary: (
        total: number,
        days: number,
        shorts: number,
        longForm: number
      ) =>
        `${en.format(total)} views in the last ${days} days: ${en.format(shorts)} from Shorts, ${en.format(longForm)} from long-form.`,
    },
    growthChart: {
      median: "Channel median",
      highlightedShort: "Highlighted Short",
      shorts: "Shorts",
      short: "Short",
      day: (day: number | string) => `Day ${day}`,
      showTable: "Show as table",
      highlighted: (title: string) => `Highlighted: ${title}`,
      summary: (count: number, drawn: number | null) =>
        `Growth since upload for ${count} ${plural("en-US", count, { one: "Short", other: "Shorts" })}${drawn === null ? "" : ` (the ${drawn} most recent are drawn)`}.`,
      medianReaches: (views: number, day: number) =>
        `The channel median reaches ${en.format(views)} views by day ${day}.`,
    },
    shorts: {
      empty:
        "No Shorts yet. Publish a clip, or import the Shorts you posted before Nimbus.",
      importing: (percent: number) => `Importing… ${percent}%`,
      importPast: "Import past Shorts",
      waitingQuota: "Import continues after YouTube's daily quota resets.",
      importedDaily: "New uploads are imported daily.",
      title: "Title",
      columns: {
        publishedAt: "Published",
        ageDays: "Age",
        views: "Views",
        averageViewPercentage: "Watched",
        viewsDay1: "Day 1",
        viewsDay7: "Day 7",
        viewsDay28: "Day 28",
        relative: "Same age",
      },
      imported: "Posted outside Nimbus",
      age: (days: number) => `${days}d`,
      early: "still coming in",
      relative: (ratio: string) => `${ratio}× usual`,
    },
    insights: {
      connectPrompt: "Connect YouTube to learn from your published clips.",
      eligible: (eligible: number, needed: number) =>
        `${eligible} of ${needed} clips have a week of stats`,
      claudeKeyMissing: CLAUDE_KEY_MISSING_MESSAGE,
      findPatterns: "Find patterns",
      finding: "Looking for patterns…",
      suggestions: "Suggestions",
    },
    playbook: {
      targets: {
        selection: "Picking clips",
        review: "Editing clips",
      },
      ruleText: "Rule text",
      makeRoomTitle: "Make room for this rule",
      makeRoomDescription: (cap: number) =>
        `This list already has ${cap} rules. Pick one to retire.`,
      retire: "Retire",
      restore: "Restore",
      retireAndRestore: "Retire and restore",
      empty: "No rules yet",
      retired: (count: number) => `Retired (${count})`,
    },
    suggestion: {
      kinds: {
        add: "New rule",
        edit: "Change rule",
        retire: "Retire rule",
      },
      strong: "Strong",
      moderate: "Moderate",
      weak: "Weak",
      now: "Now:",
      retire: "Retire:",
      changeTo: "Change to:",
      evidence: "Evidence",
      against: "Against",
      imported: "(posted outside Nimbus)",
      views: (views: number) => `${en.format(views)} views`,
      editThenApprove: "Edit, then approve",
      retireAndApprove: "Retire and approve",
    },
  },
  "pt-BR": {
    layout: {
      title: "Análises",
      shortsTitle: "Shorts · Análises",
      insightsTitle: "Insights · Análises",
      sections: "Seções das análises",
      overview: "Visão geral",
      shorts: "Shorts",
      insights: "Insights",
      connectPrompt:
        "Conecte um canal do YouTube para ver como seus Shorts estão indo.",
      connect: "Conectar",
      reconnectPrompt:
        "Reconecte o YouTube para manter estes números atualizados.",
      reconnect: "Reconectar",
    },
    period: {
      label: "Período",
      days: (days) => `${days} dias`,
    },
    overview: {
      dataThrough: (date) =>
        `Dados até ${date}. O YouTube libera os números com 2 a 3 dias de atraso.`,
      fetching: "Buscando os números do seu canal no YouTube…",
      empty: "Nenhuma visualização neste período ainda.",
      tiles: {
        views: "Visualizações",
        watchHours: "Horas assistidas",
        netSubscribers: "Saldo de inscritos",
        averageViewDurationS: "Duração média da visualização",
        likes: "Curtidas",
      },
      viewsPerDay: "Visualizações por dia",
      topShorts: "Melhores Shorts do período",
      noTopShorts: "Nenhum Short ganhou visualizações neste período.",
      untitled: "Short sem título",
      gained: (views) => `+${visualizacoes(views)}`,
    },
    viewsChart: {
      views: "Visualizações",
      shorts: "Shorts",
      longForm: "Vídeos longos",
      day: "Dia",
      showTable: "Mostrar como tabela",
      summary: (total, days) =>
        `${visualizacoes(total)} nos últimos ${days} dias.`,
      splitSummary: (total, days, shorts, longForm) =>
        `${visualizacoes(total)} nos últimos ${days} dias: ${pt.format(shorts)} de Shorts, ${pt.format(longForm)} de vídeos longos.`,
    },
    growthChart: {
      median: "Mediana do canal",
      highlightedShort: "Short em destaque",
      shorts: "Shorts",
      short: "Short",
      day: (day) => `Dia ${day}`,
      showTable: "Mostrar como tabela",
      highlighted: (title) => `Em destaque: ${title}`,
      summary: (count, drawn) =>
        `Crescimento desde a publicação de ${count} ${plural("pt-BR", count, { one: "Short", other: "Shorts" })}${drawn === null ? "" : ` (os ${drawn} mais recentes aparecem no gráfico)`}.`,
      medianReaches: (views, day) =>
        `A mediana do canal chega a ${visualizacoes(views)} no dia ${day}.`,
    },
    shorts: {
      empty:
        "Nenhum Short ainda. Publique um corte ou importe os Shorts que você postou antes do Nimbus.",
      importing: (percent) => `Importando… ${percent}%`,
      importPast: "Importar Shorts antigos",
      waitingQuota:
        "A importação continua quando a cota diária do YouTube for renovada.",
      importedDaily: "Vídeos novos são importados todos os dias.",
      title: "Título",
      columns: {
        publishedAt: "Publicado",
        ageDays: "Idade",
        views: "Visualizações",
        averageViewPercentage: "Assistido",
        viewsDay1: "Dia 1",
        viewsDay7: "Dia 7",
        viewsDay28: "Dia 28",
        relative: "Mesma idade",
      },
      imported: "Publicado fora do Nimbus",
      age: (days) => `${days}d`,
      early: "ainda chegando",
      relative: (ratio) => `${ratio}× o normal`,
    },
    insights: {
      connectPrompt:
        "Conecte o YouTube para aprender com seus cortes publicados.",
      eligible: (eligible, needed) =>
        `${eligible} de ${needed} cortes têm uma semana de dados`,
      claudeKeyMissing:
        "Adicione uma chave de API do Claude nas configurações do workspace para usar o Claude.",
      findPatterns: "Encontrar padrões",
      finding: "Procurando padrões…",
      suggestions: "Sugestões",
    },
    playbook: {
      targets: {
        selection: "Escolha de cortes",
        review: "Edição de cortes",
      },
      ruleText: "Texto da regra",
      makeRoomTitle: "Abra espaço para esta regra",
      makeRoomDescription: (cap) =>
        `Esta lista já tem ${cap} regras. Escolha uma para arquivar.`,
      retire: "Arquivar",
      restore: "Restaurar",
      retireAndRestore: "Arquivar e restaurar",
      empty: "Nenhuma regra ainda",
      retired: (count) => `Arquivadas (${count})`,
    },
    suggestion: {
      kinds: {
        add: "Nova regra",
        edit: "Alterar regra",
        retire: "Arquivar regra",
      },
      strong: "Forte",
      moderate: "Moderada",
      weak: "Fraca",
      now: "Agora:",
      retire: "Arquivar:",
      changeTo: "Mudar para:",
      evidence: "Evidências",
      against: "Contra",
      imported: "(publicado fora do Nimbus)",
      views: (views) => visualizacoes(views),
      editThenApprove: "Editar e aprovar",
      retireAndApprove: "Arquivar e aprovar",
    },
  },
})
