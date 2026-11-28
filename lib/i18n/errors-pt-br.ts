const general: Record<string, string> = {
  "Something went wrong. Check the logs for details.":
    "Algo deu errado. Veja os logs para mais detalhes.",
  "Sign in to continue": "Entre para continuar",
  "Not found": "Não encontrado",
  "File not found": "Arquivo não encontrado",
  "Font not found": "Fonte não encontrada",
  "Font not installed": "Fonte não instalada",
  "Stored file not found": "Arquivo armazenado não encontrado",
  "The storage bucket doesn't exist": "O bucket de armazenamento não existe",
  "Could not remove stored files":
    "Não foi possível remover os arquivos armazenados",
  "Invalid input": "Entrada inválida",
  "Invalid value": "Valor inválido",
  "Invalid settings": "Configurações inválidas",
  "Invalid id": "ID inválido",
  "Invalid project id": "ID do projeto inválido",
  "Invalid clip id": "ID do corte inválido",
  "Invalid publication id": "ID da publicação inválido",
  "Invalid rule id": "ID da regra inválido",
  "Invalid suggestion id": "ID da sugestão inválido",
  "Invalid track id": "ID da faixa inválido",
  "Invalid approval": "Aprovação inválida",
  "Invalid rule": "Regra inválida",
}

const accounts: Record<string, string> = {
  "Choose an image": "Escolha uma imagem",
  "That image is too large": "Essa imagem é grande demais",
  "Use a PNG, JPEG or WebP image": "Use uma imagem PNG, JPEG ou WebP",
  "Unknown avatar": "Avatar desconhecido",
  "Choose another session": "Escolha outra sessão",
  "Session not found": "Sessão não encontrada",
  "Unknown language": "Idioma desconhecido",
  "Enter a name": "Digite um nome",
  "Use at least 10 characters": "Use pelo menos 10 caracteres",
  "That doesn't look like a Claude API key":
    "Isso não parece uma chave de API do Claude",
  "That doesn't look like a Groq API key":
    "Isso não parece uma chave de API do Groq",
  "Add a Claude API key in Workspace settings to use Claude.":
    "Adicione uma chave de API do Claude nas configurações do workspace para usar o Claude.",
}

const projects: Record<string, string> = {
  "Project not found": "Projeto não encontrado",
  "Name must be 1–120 characters": "O nome precisa ter de 1 a 120 caracteres",
  "Unknown step": "Etapa desconhecida",
  "Wait for the current step to finish before changing settings":
    "Espere a etapa atual terminar antes de mudar as configurações",
  "Wait for the current step to finish": "Espere a etapa atual terminar",
  "The video hasn't finished importing":
    "O vídeo ainda não terminou de importar",
  "There are no rendered clips to redo":
    "Não há cortes renderizados para refazer",
  "Highlights haven't been found yet":
    "Os destaques ainda não foram encontrados",
  "Invalid import options": "Opções de importação inválidas",
  "Upload an MP4, MOV, MKV or WebM video":
    "Envie um vídeo MP4, MOV, MKV ou WebM",
  "This file is larger than the upload limit":
    "Este arquivo é maior que o limite de envio",
  "This file doesn't look like a supported video (MP4, MOV, MKV or WebM)":
    "Este arquivo não parece ser um vídeo compatível (MP4, MOV, MKV ou WebM)",
  "There are no clips to render": "Não há cortes para renderizar",
  "Nothing is running for this project": "Nada está em execução neste projeto",
  "Minimum clip length must be shorter than the maximum":
    "A duração mínima do corte precisa ser menor que a máxima",
  "This upload link has expired": "Este link de envio expirou",
  "The upload didn't arrive": "O envio não chegou",
  "The upload didn't finish. Try again.":
    "O envio não terminou. Tente de novo.",
  "Invalid upload": "Envio inválido",
  "The upload was empty": "O envio veio vazio",
  "Invalid upload parts": "Partes do envio inválidas",
  "This upload is already complete": "Este envio já foi concluído",
  "Nothing has been rendered yet": "Nada foi renderizado ainda",
}

const downloads: Record<string, string> = {
  "Paste a link to a video": "Cole o link de um vídeo",
  "This project has no link to download":
    "Este projeto não tem link para baixar",
  "This is a live stream. Import it once the stream has ended.":
    "Esta live ainda está no ar. Importe quando ela terminar.",
  "This is a playlist or channel link. Paste a link to a single video.":
    "Este link é de uma playlist ou de um canal. Cole o link de um único vídeo.",
  "This video is larger than the upload limit":
    "Este vídeo é maior que o limite de envio",
  "The downloaded video isn't in a supported format":
    "O vídeo baixado não está em um formato compatível",
  "yt-dlp returned unreadable video details":
    "O yt-dlp retornou dados do vídeo ilegíveis",
  "YouTube still wants a sign-in to confirm this isn't a bot. Sign in to YouTube in the browser set in YTDLP_COOKIES_FROM_BROWSER (or refresh YTDLP_COOKIES) and try again.":
    "O YouTube ainda pede login para confirmar que não é um robô. Entre no YouTube no navegador definido em YTDLP_COOKIES_FROM_BROWSER (ou atualize YTDLP_COOKIES) e tente de novo.",
  "YouTube wants a sign-in to confirm this isn't a bot. Set YTDLP_COOKIES_FROM_BROWSER to a browser you're signed in to (dia, chrome, safari, firefox, ...) in .env.local, restart, and try again.":
    "O YouTube pede login para confirmar que não é um robô. Defina YTDLP_COOKIES_FROM_BROWSER com um navegador em que você está conectado (dia, chrome, safari, firefox, ...) no .env.local, reinicie e tente de novo.",
  "This video is private": "Este vídeo é privado",
  "This video is for channel members only":
    "Este vídeo é só para membros do canal",
  "This video is age-restricted and can't be downloaded without signing in":
    "Este vídeo tem restrição de idade e não pode ser baixado sem login",
  "The site is rate limiting downloads. Try again in a few minutes.":
    "O site está limitando os downloads. Tente de novo em alguns minutos.",
  "This link isn't a video page yt-dlp can download":
    "Este link não é uma página de vídeo que o yt-dlp consegue baixar",
  "This video is unavailable or was removed":
    "Este vídeo está indisponível ou foi removido",
  "This video hasn't premiered yet": "Este vídeo ainda não estreou",
  "Couldn't reach the site. Check your connection and try again.":
    "Não foi possível acessar o site. Verifique sua conexão e tente de novo.",
  "yt-dlp found nothing it can play for this video, which usually means it's out of date. Update it (brew upgrade yt-dlp) and try again.":
    "O yt-dlp não encontrou nada que consiga reproduzir neste vídeo, o que normalmente quer dizer que ele está desatualizado. Atualize (brew upgrade yt-dlp) e tente de novo.",
  "Download failed": "Falha no download",
  "Download was cancelled": "O download foi cancelado",
}

const pipeline: Record<string, string> = {
  "The failed step is unknown": "Não sabemos qual etapa falhou",
  "Couldn't read this file's media info":
    "Não foi possível ler as informações de mídia deste arquivo",
  "This file has no video track": "Este arquivo não tem faixa de vídeo",
  "This file has no audio track": "Este arquivo não tem faixa de áudio",
  "This file has no playable duration":
    "Este arquivo não tem duração reproduzível",
  "This file has no audio": "Este arquivo não tem áudio",
  "This file couldn't be read as audio":
    "Não foi possível ler este arquivo como áudio",
  "This file couldn't be read as a video":
    "Não foi possível ler este arquivo como vídeo",
  "Project was deleted": "O projeto foi excluído",
  "Project was cancelled": "O projeto foi cancelado",
  "Job was cancelled": "A tarefa foi cancelada",
  "Worker shutting down": "O worker está sendo encerrado",
  "Worker stopped while running this job":
    "O worker parou enquanto executava esta tarefa",
  "The source video is missing": "O vídeo original sumiu",
  "The source video file is missing from disk":
    "O arquivo do vídeo original não está no disco",
  "The source hasn't been probed": "O vídeo original ainda não foi lido",
  "The recording is silent from start to end":
    "A gravação é silenciosa do início ao fim",
  "This ffmpeg can't burn in captions (no libass). Install one with libass or turn captions off.":
    "Este ffmpeg não consegue embutir legendas (sem libass). Instale um com libass ou desative as legendas.",
  "This ffmpeg can't burn in captions (no libass). Install one with libass or turn captions off for this clip.":
    "Este ffmpeg não consegue embutir legendas (sem libass). Instale um com libass ou desative as legendas deste corte.",
  "This ffmpeg can't burn in on-screen text (no libass). Install one with libass or remove the text.":
    "Este ffmpeg não consegue embutir texto na tela (sem libass). Instale um com libass ou remova o texto.",
  "Groq rejected the transcription key. Check it in Workspace settings.":
    "O Groq recusou a chave de transcrição. Confira nas configurações do espaço de trabalho.",
  "Could not reach Groq": "Não foi possível conectar ao Groq",
  "Transcription was cancelled": "A transcrição foi cancelada",
  'Paste the JSON object that starts with {"clips":':
    'Cole o objeto JSON que começa com {"clips":',
  "That isn't valid JSON": "Isso não é um JSON válido",
  "couldn't reach the Anthropic API":
    "não foi possível conectar à API da Anthropic",
  "the API key was rejected": "a chave de API foi rejeitada",
  "rate limited, try again in a minute":
    "limite de requisições atingido, tente de novo em um minuto",
  "the transcript is too long for one request":
    "a transcrição é longa demais para uma única requisição",
  "the API is overloaded or unavailable":
    "a API está sobrecarregada ou indisponível",
}

const clips: Record<string, string> = {
  "Clip not found": "Corte não encontrado",
  "Clip was deleted": "O corte foi excluído",
  "Paste the JSON reply": "Cole a resposta em JSON",
  "Invalid clip status": "Status de corte inválido",
  "Invalid clip": "Corte inválido",
  "Invalid clip range": "Intervalo de corte inválido",
  "Pick where the clip starts and ends":
    "Escolha onde o corte começa e termina",
  "Wait for analysis to finish before adding clips":
    "Espere a análise terminar antes de adicionar cortes",
  "None of those clips fit the recording and length limits":
    "Nenhum desses cortes cabe na gravação e nos limites de duração",
  "The clip must stay inside the recording":
    "O corte precisa ficar dentro da gravação",
  "The clip must end after it starts":
    "O corte precisa terminar depois de começar",
  "The clip needs at least one part": "O corte precisa de pelo menos uma parte",
  "Two parts of the clip overlap": "Duas partes do corte se sobrepõem",
  "Clips can only be approved, rejected or reset":
    "Cortes só podem ser aprovados, rejeitados ou redefinidos",
  "This clip is rendering": "Este corte está sendo renderizado",
  "Wait for this clip to finish rendering":
    "Espere este corte terminar de renderizar",
  "Wait for the recording to be probed before planning effects":
    "Espere a gravação ser verificada antes de planejar os efeitos",
  "A caption must end after it starts":
    "A legenda precisa terminar depois de começar",
  "Write the caption or delete it": "Escreva a legenda ou exclua",
  "Write the text or delete it": "Escreva o texto ou exclua",
  "Keep the text on screen for at least half a second":
    "Mantenha o texto na tela por pelo menos meio segundo",
  "Effect must end after it starts":
    "O efeito precisa terminar depois de começar",
  "Rect must have a size": "O retângulo precisa ter tamanho",
  "Rect must stay inside the frame":
    "O retângulo precisa ficar dentro do quadro",
  "Pick clips to render": "Escolha cortes para renderizar",
  "Finish reviewing the project before rendering":
    "Termine de revisar o projeto antes de renderizar",
  "Approve clips before rendering them": "Aprove os cortes antes de renderizar",
  "Wait for analysis to finish before rendering the edit":
    "Espere a análise terminar antes de renderizar a edição",
  "The edit is already rendering": "A edição já está sendo renderizada",
  "No clips are rendering": "Nenhum corte está sendo renderizado",
  "The edit isn't rendering": "A edição não está sendo renderizada",
}

const music: Record<string, string> = {
  "Type 2 to 100 characters to search":
    "Digite de 2 a 100 caracteres para buscar",
  "Connect YouTube in Settings › Connected channels to search for songs.":
    "Conecte o YouTube em Configurações › Canais conectados para buscar músicas.",
  "Today's YouTube quota is used up. Song search is back after the reset.":
    "A cota do YouTube de hoje acabou. A busca de músicas volta depois da renovação.",
  "Music files can be up to 50 MB": "Arquivos de música podem ter até 50 MB",
  "Upload an MP3, M4A, AAC, WAV, OGG or FLAC file":
    "Envie um arquivo MP3, M4A, AAC, WAV, OGG ou FLAC",
  "Track not found": "Faixa não encontrada",
  "Give the track a name": "Dê um nome à faixa",
  "Keep the music for at least half a second":
    "Mantenha a música por pelo menos meio segundo",
  "That music track is no longer in your library":
    "Essa faixa de música não está mais na sua biblioteca",
  "That music track is still processing. Pick it once it's ready.":
    "Essa faixa de música ainda está sendo processada. Escolha quando estiver pronta.",
  "That music track couldn't be read. Pick another track.":
    "Não foi possível ler essa faixa de música. Escolha outra faixa.",
  "Start the music before the track ends":
    "Comece a música antes do fim da faixa",
  "A music track on this clip was deleted. Pick another track or remove that music.":
    "Uma faixa de música deste corte foi excluída. Escolha outra faixa ou remova essa música.",
  "A music track on this clip isn't ready. Pick another track or remove that music.":
    "Uma faixa de música deste corte ainda não está pronta. Escolha outra faixa ou remova essa música.",
}

const publishing: Record<string, string> = {
  "YouTube rejected the access token": "O YouTube rejeitou o token de acesso",
  "YouTube API quota exceeded": "Cota da API do YouTube excedida",
  "This channel hit YouTube's own upload limit for today":
    "Este canal atingiu o limite de envios do próprio YouTube por hoje",
  "Could not reach YouTube": "Não foi possível conectar ao YouTube",
  "YouTube analytics returned no day column":
    "As análises do YouTube vieram sem a coluna de dia",
  "YouTube didn't return the video's status":
    "O YouTube não retornou o status do vídeo",
  "This Google account has no YouTube channel":
    "Esta conta do Google não tem canal no YouTube",
  "YouTube did not return an upload URL":
    "O YouTube não retornou uma URL de envio",
  "Could not read the clip to upload":
    "Não foi possível ler o corte para enviar",
  "Reconnect YouTube in Settings › Connected channels":
    "Reconecte o YouTube em Configurações › Canais conectados",
  "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required to refresh YouTube access":
    "GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET são necessários para renovar o acesso ao YouTube",
  "Invalid publish details": "Dados de publicação inválidos",
  "Publication not found": "Publicação não encontrada",
  "Publication was deleted": "A publicação foi excluída",
  "Only a failed publish can be retried":
    "Só dá para tentar de novo uma publicação que falhou",
  "The scheduled time has passed. Publish again with a new time.":
    "O horário agendado já passou. Publique de novo com um novo horário.",
  "Stats are already refreshing": "As estatísticas já estão sendo atualizadas",
  "Stats will refresh after YouTube's daily quota resets.":
    "As estatísticas serão atualizadas quando a cota diária do YouTube renovar.",
  "Render the latest edit first": "Renderize a última edição primeiro",
  "Connect YouTube first": "Conecte o YouTube primeiro",
  "This clip is already publishing": "Este corte já está sendo publicado",
  "Enter a title": "Digite um título",
  "Tags are too long": "As tags são longas demais",
  "Imported Shorts can't be published":
    "Shorts importados não podem ser publicados",
  "The YouTube channel was disconnected": "O canal do YouTube foi desconectado",
  "The YouTube channel is gone": "O canal do YouTube não existe mais",
  "The rendered clip is missing. Render it again to publish it.":
    "O corte renderizado sumiu. Renderize de novo para publicar.",
  "YouTube is still finishing the upload":
    "O YouTube ainda está finalizando o envio",
  "Already importing your Shorts": "Seus Shorts já estão sendo importados",
}

const billing: Record<string, string> = {
  "AbacatePay didn't answer": "A AbacatePay não respondeu",
  "Billing isn't set up": "A cobrança não está configurada",
  "Your plan already includes Creator": "Seu plano já inclui o Creator",
  "Your workspace is already on Creator": "Seu workspace já está no Creator",
  "This workspace has no subscription": "Este workspace não tem assinatura",
  "Invalid billing event": "Evento de cobrança inválido",
  "Invalid webhook secret": "Segredo do webhook inválido",
}

const insights: Record<string, string> = {
  "Channel not found": "Canal não encontrado",
  "Rule not found": "Regra não encontrada",
  "Write the rule": "Escreva a regra",
  "Pick an active rule from this list to retire":
    "Escolha uma regra ativa desta lista para arquivar",
  "This suggestion was already decided.": "Esta sugestão já foi decidida.",
  "Suggestion not found": "Sugestão não encontrada",
  "That rule changed since this suggestion was made. Run Find patterns again.":
    "Essa regra mudou depois que a sugestão foi feita. Rode Encontrar padrões de novo.",
  "Only an active rule can be edited.": "Só dá para editar uma regra ativa.",
  "This rule is already retired.": "Esta regra já está arquivada.",
  "This rule is already active.": "Esta regra já está ativa.",
  "Already looking for patterns": "Já estamos procurando padrões",
}

export const errorsPtBR: Record<string, string> = {
  ...general,
  ...accounts,
  ...projects,
  ...downloads,
  ...pipeline,
  ...clips,
  ...music,
  ...publishing,
  ...insights,
  ...billing,
}
