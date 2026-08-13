import React from 'react';
import { Input, Form } from 'antd';
import { useGraphStore } from '@/stores/useGraphStore';
import PropertyEditor from './PropertyEditor';
import RequiredLabelInput from './RequiredLabelInput';

const EdgeEditor: React.FC = () => {
  const { edges, nodes, selectedEdgeId, updateEdge } = useGraphStore();

  const edge = edges.find((e) => e.id === selectedEdgeId);
  if (!edge) return null;

  const getNodeLabel = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    return node?.label || id;
  };

  return (
    <div className="editor-form">
      <h4 className="editor-title">边属性</h4>
      <Form layout="vertical" size="small">
        <Form.Item label="ID">
          <Input value={edge.id} disabled style={{ fontFamily: 'var(--font-mono)' }} />
        </Form.Item>
        <Form.Item label="标签">
          <RequiredLabelInput
            key={`${edge.id}-${edge.label}`}
            label={edge.label}
            onCommit={(label) => updateEdge(edge.id, { label })}
          />
        </Form.Item>
        <Form.Item label="源节点">
          <Input value={getNodeLabel(edge.source)} disabled />
        </Form.Item>
        <Form.Item label="目标节点">
          <Input value={getNodeLabel(edge.target)} disabled />
        </Form.Item>

        <Form.Item label="谓词 URI">
          <Input
            value={edge.predicate || ''}
            onChange={(e) => updateEdge(edge.id, { predicate: e.target.value })}
            placeholder="http://example.org/predicate/..."
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </Form.Item>
        <Form.Item label="属性">
          <PropertyEditor
            properties={edge.properties || {}}
            onChange={(props) => updateEdge(edge.id, { properties: props })}
          />
        </Form.Item>
      </Form>
    </div>
  );
};

export default EdgeEditor;
