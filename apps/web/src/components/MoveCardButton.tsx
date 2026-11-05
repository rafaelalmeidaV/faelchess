import { Portal } from '@ark-ui/react/portal';
import { Download, ImageIcon, Share2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Box, HStack, Stack } from 'styled-system/jsx';
import { loadAppearance } from '../lib/appearance';
import { renderMoveCard, type MoveCardInput } from '../lib/moveCard';
import { Button, Dialog, IconButton, Text, toaster } from './ui';

type Props = Omit<MoveCardInput, 'appearance'>;

/** "Gerar imagem" no cartão de um lance brilhante: mostra a prévia e deixa salvar o PNG (ou compartilhar no celular). */
export function MoveCardButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { fenAfter, uci, san, orientation, name, userId } = props;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setBlob(null);
    setUrl(null);
    setError('');
    renderMoveCard({ fenAfter, uci, san, orientation, name, userId, appearance: loadAppearance() })
      .then((b) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Não deu para gerar a imagem'));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, fenAfter, uci, san, orientation, name, userId]);

  const fileName = `faelchess-brilhante-${san.replace(/[^a-zA-Z0-9=-]/g, '')}.png`;
  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  const save = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  };

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: 'Lance brilhante no faelchess' });
    } catch (e) {
      // Fechar o menu de compartilhar não é erro.
      if (!(e instanceof DOMException && e.name === 'AbortError')) toaster.create({ title: 'Não deu para compartilhar', type: 'error' });
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(d) => setOpen(d.open)}>
      <Dialog.Trigger asChild>
        <Button variant="surface" size="sm" alignSelf="flex-start">
          <ImageIcon /> Gerar imagem
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="min(94vw, 760px)" w="full">
            <Stack gap="4" p="4">
              <HStack justify="space-between">
                <Dialog.Title>Lance brilhante</Dialog.Title>
                <Dialog.CloseTrigger asChild>
                  <IconButton variant="plain" size="sm" aria-label="Fechar">
                    <X />
                  </IconButton>
                </Dialog.CloseTrigger>
              </HStack>
              <Box w="full" style={{ aspectRatio: '1200 / 630' }} borderRadius="l2" overflow="hidden" bg="gray.3">
                {url && <img src={url} alt={`Lance brilhante ${san}`} style={{ width: '100%', height: '100%', display: 'block' }} />}
                {!url && !error && (
                  <Text color="fg.muted" textStyle="sm" p="4">
                    Gerando imagem…
                  </Text>
                )}
                {error && (
                  <Text color="red.11" textStyle="sm" p="4">
                    {error}
                  </Text>
                )}
              </Box>
              <HStack gap="2" justify="flex-end" flexWrap="wrap">
                {canShare && (
                  <Button variant="surface" onClick={share}>
                    <Share2 /> Compartilhar
                  </Button>
                )}
                <Button colorPalette="jade" onClick={save} disabled={!url}>
                  <Download /> Salvar PNG
                </Button>
              </HStack>
            </Stack>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
