import React from 'react';
import { Input, Button, Space } from 'antd';
import { Plus, Trash2 } from 'lucide-react';

interface PropertyEditorProps {
  properties: Record<string, unknown>;
  onChange: (properties: Record<string, unknown>) => void;
  readOnly?: boolean;
}

const PropertyEditor: React.FC<PropertyEditorProps> = ({
  properties,
  onChange,
  readOnly,
}) => {
  const entries = Object.entries(properties || {});

  const updateKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const updated = { ...properties };
    const value = updated[oldKey];
    delete updated[oldKey];
    updated[newKey] = value;
    onChange(updated);
  };

  const updateValue = (key: string, newValue: string) => {
    onChange({ ...properties, [key]: newValue });
  };

  const removeProperty = (key: string) => {
    const updated = { ...properties };
    delete updated[key];
    onChange(updated);
  };

  const addProperty = () => {
    const key = `prop${entries.length + 1}`;
    onChange({ ...properties, [key]: '' });
  };

  return (
    <div className="property-editor">
      {entries.map(([key, value]) => (
        <Space key={key} style={{ marginBottom: 8 }} className="property-row">
          <Input
            size="small"
            value={key}
            onChange={(e) => updateKey(key, e.target.value)}
            disabled={readOnly}
            placeholder="键"
            style={{ width: 100, fontFamily: 'var(--font-mono)' }}
          />
          <Input
            size="small"
            value={String(value)}
            onChange={(e) => updateValue(key, e.target.value)}
            disabled={readOnly}
            placeholder="值"
            style={{ width: 140 }}
          />
          {!readOnly && (
            <Button
              type="text"
              size="small"
              danger
              icon={<Trash2 size={12} />}
              onClick={() => removeProperty(key)}
            />
          )}
        </Space>
      ))}
      {!readOnly && (
        <Button
          type="dashed"
          size="small"
          icon={<Plus size={14} />}
          onClick={addProperty}
          style={{ width: '100%', marginTop: 4 }}
        >
          添加属性
        </Button>
      )}
    </div>
  );
};

export default PropertyEditor;
