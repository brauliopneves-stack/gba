# GBA Link

Emulador de Game Boy Advance que roda no navegador e pode ser instalado no
iPhone como app (PWA). Ele roda **dois jogos ao mesmo tempo, conectados por um
cabo link virtual**, para trocar Pokémon entre os seus próprios saves.

## Instalar no iPhone

1. Abra o endereço do app no **Safari** (ex.: `https://SEU-USUARIO.github.io/gba-link/`).
2. Toque em **Compartilhar** → **Adicionar à Tela de Início**.
3. Abra pelo ícone da tela inicial. Depois do primeiro acesso, ele funciona sem internet.

## Usar

- **+ Jogo**: importa arquivos `.gba` ou `.zip` do app Arquivos.
- Toque no cartucho para jogar. O jogo grava sozinho quando você salva dentro dele.
- **⋯** no cartucho: exportar/importar save (`.sav`), renomear, excluir.
- **Troca**: escolha dois cartuchos (P1 e P2). As duas telas aparecem juntas;
  toque numa tela para escolher qual jogo os controles comandam. Em ambos os
  jogos, vá ao 2º andar do Pokémon Center e fale com a atendente do Cable Club.
- **▶▶** alterna a velocidade (1×, 2×, 4×).

Exporte seus saves de vez em quando: o iOS pode apagar dados de apps web que
ficam muito tempo sem uso.

## Estrutura

```
index.html            página única do app
manifest.webmanifest  dados de instalação (nome, ícones)
sw.js                 cache offline
app/                  interface, biblioteca, controles, cabo link
core/                 núcleo de emulação (GBA.js, modificado)
icons/                ícones gerados por tools/make-icons.ps1
tools/serve.ps1       servidor local para testes: http://localhost:8080
```

Ao alterar qualquer arquivo, aumente `VERSION` em `sw.js` para que o app
instalado baixe a nova versão.

## Créditos

O núcleo em `core/` é o [GBA.js](https://github.com/endrift/gbajs) de Jeffrey
Pfau (licença BSD de 2 cláusulas, ver `core/LICENSE-gbajs.txt`), com estas
mudanças: cabo link em modo multi-player (`sio.js`), áudio compartilhado entre
instâncias, teclado/controle tratados pelo app e correções de registradores.
