import { useMemo, useState } from 'react';
import { Chat } from './components/Chat';
import { SettingsBar } from './components/SettingsBar';
import { mockProvider, openAICompatibleProvider } from './agent/provider';

export default function App() {
  // Real model is available only if an endpoint is configured in .env.local.
  const configuredModel = (import.meta as any).env?.VITE_LLM_MODEL as string | undefined;
  const hasRealProvider = Boolean((import.meta as any).env?.VITE_LLM_BASE_URL) && Boolean(configuredModel);

  const [useMock, setUseMock] = useState(!hasRealProvider);

  const provider = useMemo(
    () => (useMock ? mockProvider : openAICompatibleProvider(configuredModel || 'model')),
    [useMock, configuredModel]
  );

  return (
    <div className="app">
      <header className="app__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden />
          <div>
            <div className="brand__name">Shadow</div>
            <div className="brand__sub">Marketing Analytics Agent · take-home</div>
          </div>
        </div>
        <SettingsBar
          useMock={useMock}
          setUseMock={setUseMock}
          hasRealProvider={hasRealProvider}
          model={configuredModel}
        />
      </header>

      <Chat provider={provider} />
    </div>
  );
}
