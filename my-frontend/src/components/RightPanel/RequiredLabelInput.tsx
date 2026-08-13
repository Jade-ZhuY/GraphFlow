import React, { useState } from 'react';
import { Input } from 'antd';

interface RequiredLabelInputProps {
  label: string;
  onCommit: (label: string) => void;
}

const RequiredLabelInput: React.FC<RequiredLabelInputProps> = ({
  label,
  onCommit,
}) => {
  const [draft, setDraft] = useState(label);
  const [error, setError] = useState<string | null>(null);

  const resetDraft = () => {
    setDraft(label);
    setError(null);
  };

  const commitDraft = () => {
    const nextLabel = draft.trim();
    if (!nextLabel) {
      setDraft(label);
      setError('标签不能为空');
      return;
    }

    setDraft(nextLabel);
    setError(null);
    if (nextLabel !== label) {
      onCommit(nextLabel);
    }
  };

  return (
    <div className="required-label-input">
      <Input
        value={draft}
        status={error ? 'error' : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError(null);
        }}
        onBlur={commitDraft}
        onPressEnter={(event) => event.currentTarget.blur()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            resetDraft();
          }
        }}
      />
      {error && <div className="required-label-error">{error}</div>}
    </div>
  );
};

export default RequiredLabelInput;
