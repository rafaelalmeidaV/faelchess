import { Camera, Eye, EyeOff, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Box, Grid, HStack, Stack } from 'styled-system/jsx';
import { AppearanceSettings } from '../components/AppearanceSettings';
import { Muted, Panel } from '../components/kit';
import { Avatar, Button, Field, Heading, IconButton, Input, Text, toaster } from '../components/ui';
import { api } from '../lib/api';
import { avatarUrl, bumpAvatarVersion, prepareAvatar } from '../lib/avatar';
import { getAccessKey, saveAccessKey, saveProfile, slugify, type Profile } from '../lib/profile';

function CardHead({ title, sub }: { title: string; sub: string }) {
  return (
    <Stack gap="1">
      <Heading as="h2" textStyle="lg">
        {title}
      </Heading>
      <Muted>{sub}</Muted>
    </Stack>
  );
}

function KeyField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <Field.Root>
      <Field.Label>Chave de acesso</Field.Label>
      <HStack gap="2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} type={show ? 'text' : 'password'} autoComplete="off" flex="1" />
        <IconButton variant="surface" aria-label={show ? 'Esconder chave' : 'Mostrar chave'} onClick={() => setShow((s) => !s)} type="button">
          {show ? <EyeOff /> : <Eye />}
        </IconButton>
      </HStack>
      <Field.HelperText>Definida no .env da API (ACCESS_KEY). Convidados de partidas online não precisam dela.</Field.HelperText>
    </Field.Root>
  );
}

/** Foto de perfil: só quem tem a chave envia. Fica no servidor e aparece nas partidas para quem joga com você. */
function AvatarPicker({ profile, hasKey }: { profile: Profile; hasKey: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = () => {
    bumpAvatarVersion();
    setTick((t) => t + 1);
  };
  const fail = (e: unknown) =>
    toaster.create({ title: 'Não deu para salvar a foto', description: e instanceof Error ? e.message : undefined, type: 'error' });

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      await api.setAvatar(profile.userId, await prepareAvatar(file));
      refresh();
      toaster.create({ title: 'Foto atualizada', type: 'success' });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.removeAvatar(profile.userId);
      refresh();
      toaster.create({ title: 'Foto removida', type: 'success' });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="2">
      <Text textStyle="sm" fontWeight="medium">
        Foto de perfil
      </Text>
      <HStack gap="4">
        <Avatar.Root key={`${profile.userId}-${tick}`} size="2xl" colorPalette="jade" variant="subtle" borderRadius="l3">
          <Avatar.Image src={avatarUrl(profile.userId)} alt="" />
          <Avatar.Fallback>{profile.name.trim().charAt(0).toUpperCase()}</Avatar.Fallback>
        </Avatar.Root>
        <Stack gap="2">
          <HStack gap="2" flexWrap="wrap">
            <Button type="button" variant="surface" size="sm" onClick={() => input.current?.click()} disabled={!hasKey || busy} loading={busy} loadingText="Enviando…">
              <Camera /> Escolher foto
            </Button>
            <Button type="button" variant="plain" size="sm" color="fg.muted" onClick={remove} disabled={!hasKey || busy}>
              <Trash2 /> Remover
            </Button>
          </HStack>
          <Muted>{hasKey ? 'Aparece para quem joga com você. É recortada em quadrado.' : 'Salve a chave de acesso para enviar uma foto.'}</Muted>
        </Stack>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </HStack>
    </Stack>
  );
}

/** Também serve de tela de boas-vindas (sem perfil ainda). */
export function SettingsPage({ profile, onSaved }: { profile: Profile | null; onSaved: (p: Profile) => void }) {
  const [name, setName] = useState(profile?.name ?? '');
  const [userId, setUserId] = useState(profile?.userId ?? '');
  const [key, setKey] = useState(getAccessKey());
  const [savedKey, setSavedKey] = useState(getAccessKey());

  const save = (e?: React.FormEvent) => {
    e?.preventDefault();
    const p = { name: name.trim() || 'Jogador', userId: slugify(userId || name) };
    saveProfile(p);
    saveAccessKey(key.trim());
    setSavedKey(key.trim());
    onSaved(p);
    toaster.create({ title: 'Configurações salvas', type: 'success' });
  };

  const profileFields = (
    <>
      <Field.Root required>
        <Field.Label>Seu nome</Field.Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus={!profile} />
      </Field.Root>
      <Field.Root>
        <Field.Label>Id do jogador</Field.Label>
        <Input value={userId} placeholder={slugify(name || 'jogador')} onChange={(e) => setUserId(e.target.value)} maxLength={40} />
        <Field.HelperText>É por ele que as partidas são agrupadas e que o MCP filtra. Use o mesmo id em todos os aparelhos.</Field.HelperText>
      </Field.Root>
    </>
  );

  // Boas-vindas: um cartão só, centralizado.
  if (!profile)
    return (
      <Box maxW="md" mx="auto" mt={{ base: '4', md: '12' }}>
        <Panel asChild gap="5">
          <form onSubmit={save}>
            <CardHead title="Bem-vindo ao faelchess" sub="Seu perfil fica salvo neste navegador." />
            {profileFields}
            <KeyField value={key} onChange={setKey} />
            <Button type="submit" colorPalette="jade">
              Começar
            </Button>
          </form>
        </Panel>
      </Box>
    );

  return (
    <Stack gap="5" maxW="6xl" mx="auto">
      <Stack gap="1">
        <Heading as="h1" textStyle={{ base: '2xl', md: '3xl' }}>
          Configurações
        </Heading>
        <Muted textStyle="md">Seu perfil fica salvo neste navegador.</Muted>
      </Stack>

      <Grid gridTemplateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }} gap="5" alignItems="start">
        <Panel asChild gap="5">
          <form onSubmit={save}>
            <CardHead title="Perfil" sub="Como você aparece nas partidas." />
            <AvatarPicker profile={profile} hasKey={!!savedKey} />
            {profileFields}
            <Box>
              <Button type="submit" colorPalette="jade" minW="28">
                Salvar
              </Button>
            </Box>
          </form>
        </Panel>

        <Panel asChild gap="5">
          <form onSubmit={save}>
            <CardHead title="Acesso" sub="Só quem tem a chave cria e salva partidas." />
            <KeyField value={key} onChange={setKey} />
            <HStack gap="2" px="3" py="2.5" borderRadius="l2" bg={savedKey ? 'jade.a3' : 'gray.a3'} color={savedKey ? 'jade.11' : 'fg.muted'}>
              {savedKey ? <ShieldCheck size={16} /> : <KeyRound size={16} />}
              <Text textStyle="sm" fontWeight="semibold">
                {savedKey ? `Chave salva · ${window.location.host}` : 'Nenhuma chave salva neste navegador'}
              </Text>
            </HStack>
            <Box>
              <Button type="submit" variant="surface" minW="28">
                Salvar chave
              </Button>
            </Box>
          </form>
        </Panel>
      </Grid>

      <AppearanceSettings />
    </Stack>
  );
}
