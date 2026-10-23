# Instalar o GBA Link no iPhone (sem App Store)

O app é instalado do seu PC com Windows para o iPhone pelo cabo USB, usando o
**Sideloadly** (grátis). A Apple exige que todo app fora da App Store seja
assinado com um Apple ID; o Sideloadly faz isso com o seu.

## Uma vez só: preparar o PC

1. Instale o **iTunes** e o **iCloud** baixados do site da Apple
   (apple.com/itunes e apple.com/icloud). As versões da Microsoft Store não
   funcionam com o Sideloadly.
2. Instale o **Sideloadly**: https://sideloadly.io

## Instalar o app

1. Baixe o **GBALink.ipa** em
   https://github.com/brauliopneves-stack/gba/releases/latest
2. Ligue o iPhone no PC pelo cabo. Se o iPhone perguntar, toque em **Confiar**.
3. Abra o Sideloadly. Seu iPhone aparece em "iDevice".
4. Arraste o `GBALink.ipa` para a janela do Sideloadly.
5. Em "Apple ID", digite seu e-mail da Apple e clique em **Start**. Ele pede a
   senha do Apple ID (e o código de verificação, se tiver). Se preferir, use
   um Apple ID secundário só para isso.
6. Espere aparecer **Done**.

## Primeira abertura no iPhone

1. **Ajustes → Privacidade e Segurança → Modo de Desenvolvedor** → ativar.
   O iPhone reinicia; depois confirme **Ativar**.
2. **Ajustes → Geral → VPN e Gerenciamento de Dispositivo** → toque no seu
   e-mail → **Confiar**.
3. Abra o **GBA Link** pela tela inicial.

## A cada 7 dias

Com Apple ID gratuito, a Apple faz o app parar de abrir depois de 7 dias.
Para renovar, ligue o iPhone no PC e repita "Instalar o app" com o mesmo
Apple ID: **seus jogos e saves continuam lá**. No Sideloadly, a opção
**Automatic Refresh** pode renovar sozinha quando o PC e o iPhone estão no
mesmo Wi-Fi.

Com uma conta de desenvolvedor paga da Apple (US$ 99/ano) o prazo passa a
ser de 1 ano.

## Atualizações

Toda vez que o código muda no GitHub, um novo `GBALink.ipa` é gerado no
mesmo link. Para atualizar, instale-o por cima pelo Sideloadly.

## Dicas

- Jogos: salve os `.gba` ou `.zip` no app **Arquivos** e toque em **+ Jogo**.
- O som toca mesmo com o iPhone no modo silencioso.
- Exporte seus saves de vez em quando (⋯ no cartucho → Exportar save).
- Saves da versão do Safari não passam sozinhos para o app: exporte-os lá e
  importe no app.
