import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { useArkose } from '@/arkose/ArkoseProvider';
import { FLOWS, type Flow } from '@/arkose/types';
import { Banner, Button, Card, Field, H2, Muted, Row, Screen, Segmented } from '@/components/ui';
import { DEFAULT_API_URL } from '@/api/client';
import { useSettings, type Integration } from '@/state/settings';
import { colors, space } from '@/theme';

const FLOW_LABEL: Record<Flow, string> = { search: 'Search', signup: 'Sign-up', login: 'Login', checkout: 'Checkout' };

export default function SettingsScreen() {
  const { settings, update, setFlowMethod, reset, methodFor } = useSettings();
  const { server, serverError, reloadConfig, sdkInstalled } = useArkose();
  const [apiUrl, setApiUrl] = useState(settings.apiUrl);
  const [checking, setChecking] = useState(false);

  const applyUrl = async () => {
    setChecking(true);
    update({ apiUrl: apiUrl.trim() });
    // reloadConfig also re-runs from the provider when apiUrl changes; calling it here gives immediate feedback.
    setTimeout(async () => {
      await reloadConfig();
      setChecking(false);
    }, 50);
  };

  const mock = server?.mode === 'mock';

  return (
    <Screen>
      <Card style={{ gap: space.sm }}>
        <H2>Server</H2>
        <Field label="API base URL" value={apiUrl} onChangeText={setApiUrl} keyboardType="url" placeholder="http://192.168.1.20:4000" />
        <Button title="Save & test connection" onPress={applyUrl} loading={checking} variant="secondary" icon="refresh" />
        {serverError ? <Banner kind="error" title="Not connected">{serverError}</Banner> : null}
        {server ? (
          <Banner kind={mock ? 'info' : 'success'} title={mock ? 'Connected · Arkose MOCK mode' : 'Connected · Arkose LIVE mode'}>
            {mock
              ? 'The server fabricates Verify API responses, so no Arkose account is needed. Pick a scenario below.'
              : 'Tokens are verified against the real Arkose Verify API.'}
          </Banner>
        ) : null}
        <Muted>Physical phone: use your computer's LAN IP (not localhost). Android emulator: http://10.0.2.2:4000.</Muted>
      </Card>

      <Card style={{ gap: space.md }}>
        <H2>Integration method</H2>
        <Muted>Native SDK and WebView are two ways to get the same single-use token. Compare them side by side.</Muted>
        <Segmented<Integration>
          value={settings.integration}
          onChange={(integration) => update({ integration })}
          options={[
            { value: 'mixed', label: 'Mixed' },
            { value: 'native', label: 'All native' },
            { value: 'webview', label: 'All webview' },
          ]}
        />
        {settings.integration === 'mixed'
          ? FLOWS.map((f) => (
              <View key={f} style={{ gap: 6 }}>
                <Text style={{ fontWeight: '600', color: colors.text }}>{FLOW_LABEL[f]}</Text>
                <Segmented
                  value={methodFor(f)}
                  onChange={(m) => setFlowMethod(f, m)}
                  options={[
                    { value: 'native', label: 'Native SDK' },
                    { value: 'webview', label: 'WebView' },
                  ]}
                />
              </View>
            ))
          : null}
        {!sdkInstalled && server?.mode === 'live' ? (
          <Banner kind="warn" title="Native SDK not installed">
            Native flows need react-native-arkoselabs (a .tgz from your CSM). Until then, switch flows to WebView. See docs/SETUP.md.
          </Banner>
        ) : null}
        {!sdkInstalled && mock ? <Muted>Native SDK package not installed: native flows are simulated (fine for mock mode).</Muted> : null}
      </Card>

      {mock ? (
        <Card style={{ gap: space.md }}>
          <H2>Demo scenario (mock mode)</H2>
          <Muted>Chooses what the simulated Arkose reports for the next session.</Muted>
          <Segmented
            value={settings.scenario}
            onChange={(scenario) => update({ scenario })}
            options={[
              { value: 'clean', label: 'Clean' },
              { value: 'challenged', label: 'Challenge' },
              { value: 'vpn', label: 'VPN' },
            ]}
          />
          <Segmented
            value={settings.scenario}
            onChange={(scenario) => update({ scenario })}
            options={[
              { value: 'bot', label: 'Bot' },
              { value: 'farm', label: 'Solver farm' },
              { value: 'denylist', label: 'Denylist' },
            ]}
          />
          <Segmented
            value={settings.scenario}
            onChange={(scenario) => update({ scenario })}
            options={[
              { value: 'invalid', label: 'Bad token' },
              { value: 'timeout', label: 'Arkose outage' },
            ]}
          />
          <ScenarioHelp scenario={settings.scenario} />
        </Card>
      ) : null}

      <Card style={{ gap: space.md }}>
        <H2>Challenge &amp; debugging</H2>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: space.md }}>
            <Text style={{ fontWeight: '600', color: colors.text }}>Always show a challenge</Text>
            <Muted>Native: sets noSuppress so the challenge appears even for clean sessions. Handy for demos. Not available for the web client in live mode.</Muted>
          </View>
          <Switch value={settings.forceChallenge} onValueChange={(forceChallenge) => update({ forceChallenge })} accessibilityLabel="Always show a challenge" />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: space.md }}>
            <Text style={{ fontWeight: '600', color: colors.text }}>Debug panel</Text>
            <Muted>Floating button showing every Arkose session and the server's decision. Turn off for a clean customer walkthrough.</Muted>
          </View>
          <Switch value={settings.debugPanel} onValueChange={(debugPanel) => update({ debugPanel })} accessibilityLabel="Show debug panel" />
        </Row>
      </Card>

      <Button title="Reset to defaults" onPress={() => { reset(); setApiUrl(DEFAULT_API_URL); }} variant="secondary" />
    </Screen>
  );
}

const HELP: Record<string, string> = {
  clean: 'Low-risk human. The session is suppressed (no challenge) and the action is allowed.',
  challenged: 'A challenge is shown and solved. Low risk. The action is allowed.',
  vpn: 'Medium risk plus a VPN IP. Search is allowed; login, sign-up and checkout require a step-up code.',
  bot: 'Automation detected: unsolved session, HIGH risk (BOT-ADV). Blocked.',
  farm: 'A human solver farm passed the challenge, but fraud-farm telltales fire. Blocked.',
  denylist: 'A denylist telltale matched. Blocked.',
  invalid: 'The token is not a valid Arkose session. Blocked.',
  timeout: 'Verify API unreachable. Search fails OPEN; login, sign-up and checkout fail CLOSED.',
};

function ScenarioHelp({ scenario }: { scenario: string }) {
  return <Banner kind="info">{HELP[scenario] ?? ''}</Banner>;
}
