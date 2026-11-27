import { defineMessages } from "@/lib/i18n/messages"

export const marketing = defineMessages({
  "en-US": {
    meta: {
      title: "nimbus: long streams in, short clips out",
      description:
        "For streamers and clippers. Paste a YouTube or Twitch link: nimbus picks the moments worth a vertical clip and edits them. Change anything you like. Nothing is published until you approve it.",
    },
    skip: "Skip to content",
    nav: {
      home: "nimbus, home",
      sections: "Sections",
      how: "How it works",
      editor: "The editor",
      learn: "What it learns",
      pricing: "Pricing",
      faq: "Questions",
    },
    tracks: {
      text: "Text",
      captions: "Captions",
      effects: "Effects",
      video: "Video",
      music: "Music",
    },
    hero: {
      badge: "For streamers and the people who clip them",
      title: "Long streams in.",
      titleAccent: "Short clips out.",
      lede: "Paste a YouTube or Twitch link. nimbus picks the moments worth a vertical clip and edits each one: framing, captions, effects. Change anything you like.",
      ledeStrong: "Nothing is published until you approve it.",
      seeHow: "See how it works",
      private: "Your projects stay private",
      approval: "You approve every clip",
      free: "Free to start",
    },
    heroEdit: {
      label:
        "A clip being edited: nimbus finds the webcam, frames the clip vertically and writes the captions; the clip is trimmed, a zoom and a song are added, and it is approved",
      clipTitle: "The 1v4 clutch nobody saw coming",
      webcam: "Webcam",
      hook: "1v4 with 12 HP",
      word1: "no way",
      word2: "he",
      word3: "peeks",
      webcamFound: "Webcam found",
      captions: "Captions, word by word",
      zoomOnKill: "Zoom 1.4× on the last kill",
      framed: "Framed 9:16, webcam on top",
      trimmed: "Trimmed to 0:28",
      musicUnder: "Night drive, under the voice",
      zoom: "Zoom",
      song: "Night drive",
      steps: {
        step1: "Find the webcam",
        step2: "Frame it vertical",
        step3: "Write the captions",
        step4: "Trim it",
        step5: "Punch in, add music",
        step6: "You approve",
      },
    },
    how: {
      title: "Three hours in.",
      titleMuted: "Nine clips out.",
      lede: "nimbus reads the whole stream, marks the moments worth keeping and hands each one back as a vertical clip. You say which ones go out.",
      steps: [
        {
          title: "Paste a link",
          body: "A YouTube video, a Twitch VOD or a file of your own. Wide and ultrawide both work.",
        },
        {
          title: "It reads all of it",
          body: "Every word with its timing, every silence, every loud moment.",
        },
        {
          title: "It picks and frames",
          body: "Each moment comes back vertical, with the webcam, a title and captions.",
        },
        {
          title: "You decide",
          body: "Only the clips you approve render. Only the ones you publish go out.",
        },
      ],
    },
    streamToClips: {
      label:
        "A three hour stream on a timeline. nimbus reads it from start to end, marks nine moments and turns each into a vertical clip. Three of the clips are approved and one is rejected.",
      file: "friday-stream.mp4",
      linesRead: "lines read",
      momentsPicked: "moments picked",
      approved: "approved",
      captions: {
        noWay: "no way",
        oneTap: "one tap",
        clutch: "clutch",
        wait: "wait",
        runIt: "run it",
        hp: "12 hp",
        letsGo: "let's go",
        what: "what",
        gg: "gg",
      },
    },
    editor: {
      title: "A first cut in minutes.",
      titleAccent: "The last word is yours.",
      lede: "Every clip opens in a real editor. Trim it, rewrite a caption, move the webcam, add a song.",
      ledeStrong: "What you see is what renders.",
      timelineLabel:
        "The clip editor's timeline with text, captions, effects, video and music tracks",
      add: "Add",
      autoEffects: "Auto effects",
      hook: "1v4 with 12 HP",
      captions: [
        "okay okay",
        "one more left",
        "no way he peeks",
        "he peeked, he peeked",
        "let's go",
      ],
      fullGame: "Full game",
      fullCam: "Full cam",
      music: "Night drive · ducks under the voice",
      notes: [
        {
          title: "Captions, word by word",
          body: "Three styles, your font, your position. Fix a misheard word and the timing stays.",
        },
        {
          title: "A layout for every clip",
          body: "Webcam on top, an even split, or no webcam at all. Drag the boxes until it sits right.",
        },
        {
          title: "Effects, text and music",
          body: "Zoom, shake, full-screen moments, a hook on screen and a track underneath, all on one timeline.",
        },
        {
          title: "Safe from the Shorts buttons",
          body: "The preview shows where YouTube puts its own interface, so nothing important hides behind it.",
        },
      ],
    },
    promise: {
      sealLabel: "Seal: nothing leaves without you",
      seal: "NIMBUS · NOTHING LEAVES WITHOUT YOU · YOU APPROVE EVERY CLIP ·",
      label: "The one promise",
      title: "Nothing leaves without you.",
      ledeStart:
        "nimbus suggests. You approve. A clip renders only after you say yes, and it reaches YouTube only when you press publish.",
      ledeStrong: "Every clip gets its own title and hook",
      ledeEnd: ", so your channel never reads like a template.",
    },
    learn: {
      title: "Post. See what worked.",
      titleMuted: "Do more of that.",
      lede: "Connect your YouTube channel and nimbus follows each Short after it goes up. Then it suggests rules for your next recordings.",
      ledeStrong: "You approve those too.",
      chartCaption: "Example · growth since upload",
      chartLabel:
        "An example Short gaining views faster than the channel's usual Short at the same age",
      thisShort: "This Short",
      usualShort: "Your usual Short at the same age",
      ruleCaption: "Example · a suggested rule",
      rule: "Put the hook on screen in the first second.",
      ruleBody:
        "Suggested from your own published clips, with the ones that support it and the ones that don't listed underneath.",
    },
    pricing: {
      title: "Start free.",
      titleMuted: "Pay when you post more.",
      plans: {
        free: {
          name: "Free",
          who: "Try it on one stream",
          cta: "Get started",
        },
        creator: {
          name: "Creator",
          who: "For posting every week",
          cta: "Choose Creator",
        },
        studio: {
          name: "Studio",
          who: "For daily streams and clipping teams",
          cta: "Get in contact",
        },
      },
      recommended: "Recommended",
      free: "Free",
      custom: "Custom",
      perMonth: "a month",
      renderMinutes: "Render minutes a month",
      storage: "Storage",
      claudeRuns: "Clip picks with Claude a month",
      publishes: "Publishes a day",
      noLimit: "No limit",
      note: "Picking and titling clips with Claude uses your own Claude API key. The built-in selector needs no key.",
    },
    faq: {
      publishing: {
        q: "Does nimbus publish anything on its own?",
        a: "No. A clip renders only after you approve it, and it goes to YouTube only when you press publish on that clip. You can change the title, description and privacy each time.",
      },
      clippers: {
        q: "I clip other people's streams. Is nimbus for me?",
        a: "Yes. Paste the link to the stream and nimbus picks and edits the clips the same way. You review them and publish to your own channel. Get the streamer's permission first: nimbus doesn't check who owns a video.",
      },
      imports: {
        q: "What can I import?",
        a: "MP4, MOV, MKV or WebM files, and links to YouTube videos, Twitch VODs and most video sites. Only import videos you own or have the rights to use.",
      },
      noWebcam: {
        q: "My recording has no webcam. Does it still work?",
        a: "Yes. nimbus looks for a webcam the first time you open a clip. Without one, the clip either fills the frame with the gameplay or shows the whole picture over a blurred copy of itself. You choose.",
      },
      languages: {
        q: "Which languages does it understand?",
        a: (names: string[]) =>
          `It detects the spoken language on its own, or you can set it: ${names.slice(0, -1).join(", ")} and ${names.at(-1)}.`,
      },
      apiKey: {
        q: "Do I need a Claude API key?",
        a: "Only if you want Claude to pick and title the clips or to suggest rules from your results. The built-in selector scores loudness, speech and your catchphrases with no key at all.",
      },
      destinations: {
        q: "Where can I publish?",
        a: "YouTube Shorts today. TikTok and Instagram are planned. You can always download the rendered clips and post them anywhere.",
      },
    },
    closing: {
      title: "The next stream already has",
      titleAccent: "the clips.",
      note: "Free to start. Only import videos you own or have the rights to use.",
    },
    footer: {
      promise: "Nothing is published until you approve it.",
    },
  },
  "pt-BR": {
    meta: {
      title: "nimbus: entra a live inteira, saem os cortes",
      description:
        "Para streamers e canais de cortes. Cole um link do YouTube ou da Twitch: o nimbus escolhe os momentos que valem um corte vertical e edita cada um. Mude o que quiser. Nada é publicado sem a sua aprovação.",
    },
    skip: "Pular para o conteúdo",
    nav: {
      home: "nimbus, início",
      sections: "Seções",
      how: "Como funciona",
      editor: "O editor",
      learn: "O que ele aprende",
      pricing: "Preços",
      faq: "Dúvidas",
    },
    tracks: {
      text: "Texto",
      captions: "Legendas",
      effects: "Efeitos",
      video: "Vídeo",
      music: "Música",
    },
    hero: {
      badge: "Para streamers e para quem tem canal de cortes",
      title: "Entra a live inteira.",
      titleAccent: "Saem os cortes.",
      lede: "Cole um link do YouTube ou da Twitch. O nimbus escolhe os momentos que valem um corte vertical e edita cada um: enquadramento, legendas, efeitos. Mude o que quiser.",
      ledeStrong: "Nada é publicado sem a sua aprovação.",
      seeHow: "Veja como funciona",
      private: "Seus projetos ficam privados",
      approval: "Você aprova cada corte",
      free: "Comece de graça",
    },
    heroEdit: {
      label:
        "Um corte sendo editado: o nimbus encontra a webcam, enquadra o corte na vertical e escreve as legendas; o corte é aparado, entram um zoom e uma música, e ele é aprovado",
      clipTitle: "O clutch 1v4 que ninguém esperava",
      webcam: "Webcam",
      hook: "1v4 com 12 de HP",
      word1: "duvido",
      word2: "ele",
      word3: "sair",
      webcamFound: "Webcam encontrada",
      captions: "Legendas, palavra por palavra",
      zoomOnKill: "Zoom de 1,4× na última kill",
      framed: "Enquadrado em 9:16, webcam em cima",
      trimmed: "Aparado para 0:28",
      musicUnder: "Night drive, por baixo da voz",
      zoom: "Zoom",
      song: "Night drive",
      steps: {
        step1: "Achar a webcam",
        step2: "Enquadrar na vertical",
        step3: "Escrever as legendas",
        step4: "Aparar",
        step5: "Dar zoom, pôr música",
        step6: "Você aprova",
      },
    },
    how: {
      title: "Entram três horas.",
      titleMuted: "Saem nove cortes.",
      lede: "O nimbus lê a live inteira, marca os momentos que valem a pena e devolve cada um como um corte vertical. Você decide quais vão ao ar.",
      steps: [
        {
          title: "Cole um link",
          body: "Um vídeo do YouTube, um VOD da Twitch ou um arquivo seu. Funciona com widescreen e com ultrawide.",
        },
        {
          title: "Ele lê tudo",
          body: "Cada palavra com o seu tempo, cada silêncio, cada pico de volume.",
        },
        {
          title: "Ele escolhe e enquadra",
          body: "Cada momento volta na vertical, com a webcam, um título e legendas.",
        },
        {
          title: "Você decide",
          body: "Só os cortes que você aprova são renderizados. Só os que você publica vão ao ar.",
        },
      ],
    },
    streamToClips: {
      label:
        "Uma live de três horas em uma linha do tempo. O nimbus lê do começo ao fim, marca nove momentos e transforma cada um em um corte vertical. Três dos cortes são aprovados e um é rejeitado.",
      file: "live-de-sexta.mp4",
      linesRead: "falas lidas",
      momentsPicked: "momentos escolhidos",
      approved: "aprovados",
      captions: {
        noWay: "não creio",
        oneTap: "one tap",
        clutch: "clutch",
        wait: "pera",
        runIt: "bora",
        hp: "12 de hp",
        letsGo: "vamooo",
        what: "quê",
        gg: "gg",
      },
    },
    editor: {
      title: "O primeiro corte em minutos.",
      titleAccent: "A palavra final é sua.",
      lede: "Todo corte abre em um editor de verdade. Apare, reescreva uma legenda, mude a webcam de lugar, coloque uma música.",
      ledeStrong: "O que você vê é o que sai na renderização.",
      timelineLabel:
        "A linha do tempo do editor de cortes, com faixas de texto, legendas, efeitos, vídeo e música",
      add: "Adicionar",
      autoEffects: "Efeitos automáticos",
      hook: "1v4 com 12 de HP",
      captions: [
        "calma calma",
        "falta um",
        "duvido ele sair",
        "saiu, saiu",
        "vamooo",
      ],
      fullGame: "Só gameplay",
      fullCam: "Só webcam",
      music: "Night drive · abaixa quando tem voz",
      notes: [
        {
          title: "Legendas, palavra por palavra",
          body: "Três estilos, a sua fonte, a posição que você quiser. Corrija uma palavra que saiu errada e o tempo continua certo.",
        },
        {
          title: "Um layout para cada corte",
          body: "Webcam em cima, tela dividida ao meio ou sem webcam nenhuma. Arraste as caixas até ficar do seu jeito.",
        },
        {
          title: "Efeitos, texto e música",
          body: "Zoom, tremor, momentos em tela cheia, um gancho na tela e uma música de fundo, tudo na mesma linha do tempo.",
        },
        {
          title: "Longe dos botões do Shorts",
          body: "A prévia mostra onde o YouTube coloca a própria interface, para nada importante ficar escondido atrás dela.",
        },
      ],
    },
    promise: {
      sealLabel: "Selo: nada vai ao ar sem você",
      seal: "NIMBUS · NADA VAI AO AR SEM VOCÊ · VOCÊ APROVA CADA CORTE ·",
      label: "A única promessa",
      title: "Nada vai ao ar sem você.",
      ledeStart:
        "O nimbus sugere. Você aprova. Um corte só é renderizado depois do seu sim, e só chega ao YouTube quando você aperta publicar.",
      ledeStrong: "Cada corte ganha título e gancho próprios",
      ledeEnd: ", para o seu canal nunca ficar com cara de template.",
    },
    learn: {
      title: "Poste. Veja o que funcionou.",
      titleMuted: "Faça mais disso.",
      lede: "Conecte o seu canal do YouTube e o nimbus acompanha cada Short depois que ele vai ao ar. Depois, sugere regras para as suas próximas gravações.",
      ledeStrong: "Essas você também aprova.",
      chartCaption: "Exemplo · crescimento desde a postagem",
      chartLabel:
        "Um Short de exemplo ganhando visualizações mais rápido do que o Short típico do canal com o mesmo tempo no ar",
      thisShort: "Este Short",
      usualShort: "Seu Short típico com o mesmo tempo no ar",
      ruleCaption: "Exemplo · uma regra sugerida",
      rule: "Coloque o gancho na tela no primeiro segundo.",
      ruleBody:
        "Sugerida a partir dos seus próprios cortes publicados, com os que confirmam a regra e os que não confirmam listados logo abaixo.",
    },
    pricing: {
      title: "Comece de graça.",
      titleMuted: "Pague quando postar mais.",
      plans: {
        free: {
          name: "Grátis",
          who: "Teste em uma live",
          cta: "Começar",
        },
        creator: {
          name: "Creator",
          who: "Para quem posta toda semana",
          cta: "Escolher o Creator",
        },
        studio: {
          name: "Studio",
          who: "Para lives diárias e equipes de cortes",
          cta: "Fale com a gente",
        },
      },
      recommended: "Recomendado",
      free: "Grátis",
      custom: "Sob medida",
      perMonth: "por mês",
      renderMinutes: "Minutos de renderização por mês",
      storage: "Armazenamento",
      claudeRuns: "Seleções de cortes com o Claude por mês",
      publishes: "Publicações por dia",
      noLimit: "Sem limite",
      note: "Escolher os cortes e dar título a eles com o Claude usa a sua própria chave de API do Claude. O seletor integrado não precisa de chave.",
    },
    faq: {
      publishing: {
        q: "O nimbus publica alguma coisa sozinho?",
        a: "Não. Um corte só é renderizado depois que você aprova, e só vai para o YouTube quando você aperta publicar naquele corte. Dá para mudar o título, a descrição e a privacidade a cada vez.",
      },
      clippers: {
        q: "Tenho um canal de cortes de outros streamers. O nimbus serve para mim?",
        a: "Serve. Cole o link da live e o nimbus escolhe e edita os cortes do mesmo jeito. Você revisa e publica no seu próprio canal. Peça a autorização do streamer antes: o nimbus não verifica de quem é o vídeo.",
      },
      imports: {
        q: "O que eu posso importar?",
        a: "Arquivos MP4, MOV, MKV ou WebM, e links de vídeos do YouTube, de VODs da Twitch e da maioria dos sites de vídeo. Importe apenas vídeos que são seus ou que você tem o direito de usar.",
      },
      noWebcam: {
        q: "Minha gravação não tem webcam. Funciona mesmo assim?",
        a: "Funciona. O nimbus procura uma webcam na primeira vez que você abre um corte. Se não achar, o corte preenche o quadro com o gameplay ou mostra a imagem inteira sobre uma cópia desfocada dela mesma. Você escolhe.",
      },
      languages: {
        q: "Quais idiomas ele entende?",
        a: (names: string[]) =>
          `Ele detecta sozinho o idioma falado, ou você pode definir: ${names.slice(0, -1).join(", ")} e ${names.at(-1)}.`,
      },
      apiKey: {
        q: "Preciso de uma chave de API do Claude?",
        a: "Só se você quiser que o Claude escolha os cortes e dê título a eles, ou que sugira regras a partir dos seus resultados. O seletor integrado pontua volume, fala e os seus bordões sem chave nenhuma.",
      },
      destinations: {
        q: "Onde posso publicar?",
        a: "Hoje, no YouTube Shorts. TikTok e Instagram estão nos planos. Você sempre pode baixar os cortes renderizados e postar onde quiser.",
      },
    },
    closing: {
      title: "A próxima live já vem com",
      titleAccent: "os cortes.",
      note: "Comece de graça. Importe apenas vídeos que são seus ou que você tem o direito de usar.",
    },
    footer: {
      promise: "Nada é publicado sem a sua aprovação.",
    },
  },
})
