# 📋 Paperback (Foliate-Jam) - Reader Menu Roadmap & TODO

Este documento rastreia as melhorias, novas funcionalidades e correções planejadas para o **Menu de Leitura** e experiência do leitor no Paperback.

---

## 🎯 Fase 1: Recursos em Implementação

- [x] **Toggle de Hifenização Automática**
  - *Descrição:* Adicionar opção no menu de configurações para ativar/desativar a hifenização de palavras no texto (`hyphenate`).
  - *Arquivos envolvidos:* [`reader.js`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.js), [`ui/menu-builder.js`](file:///home/gabrielgama/repo-personal/foliate-jam/ui/menu-builder.js)
- [x] **Controle de Espaçamento entre Linhas (`line-height`)**
  - *Descrição:* Adicionar controle no menu para alterar a distância vertical entre linhas (1.2, 1.4, 1.6, 1.8).
  - *Arquivos envolvidos:* [`reader.js`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.js), [`ui/menu-builder.js`](file:///home/gabrielgama/repo-personal/foliate-jam/ui/menu-builder.js)
- [x] **Leitura em Voz Alta (TTS) com Barra macOS Top-Bar, Grifo e Idiomas**
  - *Descrição:* Barrinha estilo macOS Notch no topo (substituindo a pílula de membros online) que desce suavemente ao ativar a leitura em voz alta. Possui destaque dinâmico do texto lido em tempo real (grifo), controles de play/pause/navegação, velocidade e seletor de vozes/idiomas da Web Speech API.
  - *Arquivos envolvidos:* [`tts.js`](file:///home/gabrielgama/repo-personal/foliate-jam/tts.js), [`reader.js`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.js), [`reader.html`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.html), [`bookclub.css`](file:///home/gabrielgama/repo-personal/foliate-jam/bookclub.css)

---

## 🎨 Fase 2: Personalização Tipográfica e Temas de Leitura

- [ ] **Seletor de Família de Fontes (Font Family)**
  - *Descrição:* Permitir alternar entre Serif, Sans-Serif, Monospace, OpenDyslexic e Padrão da Editora.
  - *Arquivos envolvidos:* [`reader.js`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.js), [`ui/menu-builder.js`](file:///home/gabrielgama/repo-personal/foliate-jam/ui/menu-builder.js)
- [ ] **Ajuste de Margens Laterais e Largura da Coluna**
  - *Descrição:* Permitir alterar largura útil do texto (Estrita, Normal, Larga).
  - *Arquivos envolvidos:* [`paginator.js`](file:///home/gabrielgama/repo-personal/foliate-jam/paginator.js#L469) (`--_margin`, `--_max-inline-size`), [`reader.js`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.js)
- [ ] **Novos Temas Visuais de Leitura**
  - *Descrição:* Adicionar opções de tema OLED Black (`#000000`), Warm Parchment e Solarized Dark.
  - *Arquivos envolvidos:* [`reader.js`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.js#L135-L145), [`reader.html`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.html)

---

## 📖 Fase 3: Modos de Layout e Navegação

- [ ] **Alternador de Coluna Única vs Dupla Página (Modo Livro)**
  - *Descrição:* Permitir que o usuário force 1 coluna centralizada ou 2 colunas em telas largas.
  - *Arquivos envolvidos:* [`paginator.js`](file:///home/gabrielgama/repo-personal/foliate-jam/paginator.js#L472) (`--_max-column-count`), [`reader.js`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.js)
- [ ] **Modo Tela Cheia (Fullscreen Toggle)**
  - *Descrição:* Botão no menu para acionar o Fullscreen do navegador.
  - *Arquivos envolvidos:* [`reader.js`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.js)
- [ ] **Auto-Scroll Suave para Modo Contínuo**
  - *Descrição:* Leitura automática com regulagem de velocidade em modo *scrolled*.
  - *Arquivos envolvidos:* [`reader.js`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.js)

---

## ✍️ Fase 4: Anotações, Citações e Estudos

- [ ] **Gerador de Imagem de Citação (Quote Cards)**
  - *Descrição:* Atalho no menu para criar cartões com trechos do livro estilizados para compartilhamento.
  - *Arquivos envolvidos:* [`quote-image.js`](file:///home/gabrielgama/repo-personal/foliate-jam/quote-image.js), [`reader.js`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.js)
- [ ] **Exportação de Destaques e Anotações**
  - *Descrição:* Opção para exportar marcadores e anotações em Markdown, TXT ou JSON.
  - *Arquivos envolvidos:* [`reader.js`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.js)
- [ ] **Acesso Rápido a Busca e Dicionário**
  - *Descrição:* Integração direta das ferramentas de pesquisa e dicionário a partir do menu.
  - *Arquivos envolvidos:* [`search.js`](file:///home/gabrielgama/repo-personal/foliate-jam/search.js), [`dict.js`](file:///home/gabrielgama/repo-personal/foliate-jam/dict.js)

---

## 📊 Fase 5: Estatísticas e Informações do Livro

- [ ] **Painel de Progresso & Tempo Restante Estimado**
  - *Descrição:* Exibir tempo estimado de leitura por capítulo e livro (baseado em palavras por minuto).
  - *Arquivos envolvidos:* [`progress.js`](file:///home/gabrielgama/repo-personal/foliate-jam/progress.js), [`reader.js`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.js)
- [ ] **Modal de Metadados e Detalhes do Livro**
  - *Descrição:* Exibir sinopse, capa em alta resolução, autor, editora e ano de publicação.
  - *Arquivos envolvidos:* [`reader.js`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.js)

---

## 🛠️ Fase 6: Arquitetura, UX e Persistência do Menu

- [ ] **Categorização por Guias/Submenus no `FoliateMenuBuilder`**
  - *Descrição:* Estruturar o menu em abas (ex: *Aparência*, *Layout*, *Ferramentas*) para evitar rolagem longa.
  - *Arquivos envolvidos:* [`ui/menu-builder.js`](file:///home/gabrielgama/repo-personal/foliate-jam/ui/menu-builder.js)
- [ ] **Persistência Completa no `localStorage`**
  - *Descrição:* Garantir salvamento de todas as novas opções de preferências entre sessões de leitura.
  - *Arquivos envolvidos:* [`reader.js`](file:///home/gabrielgama/repo-personal/foliate-jam/reader.js)
