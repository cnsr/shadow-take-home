interface Props {
  useMock: boolean;
  setUseMock: (v: boolean) => void;
  hasRealProvider: boolean;
  model?: string;
}

export function SettingsBar({ useMock, setUseMock, hasRealProvider, model }: Props) {
  return (
    <div className="settings">
      <div className="settings__mode">
        <button
          className={`pill ${useMock ? 'pill--active' : ''}`}
          onClick={() => setUseMock(true)}
        >
          Mock model
        </button>
        <button
          className={`pill ${!useMock ? 'pill--active' : ''}`}
          onClick={() => hasRealProvider && setUseMock(false)}
          disabled={!hasRealProvider}
          title={hasRealProvider ? `Using ${model}` : 'Set VITE_LLM_* in .env.local to enable'}
        >
          Real model{hasRealProvider ? ` · ${model}` : ''}
        </button>
      </div>
    </div>
  );
}
