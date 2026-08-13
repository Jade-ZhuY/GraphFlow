import React from 'react';
import { Input, Form } from 'antd';
import { useGraphStore } from '@/stores/useGraphStore';
import PropertyEditor from './PropertyEditor';
import RequiredLabelInput from './RequiredLabelInput';

const NodeEditor: React.FC = () => {
  const { nodes, selectedNodeId, updateNode } = useGraphStore();

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  return (
    <div className="editor-form">
      <h4 className="editor-title">节点属性</h4>
      <Form layout="vertical" size="small">
        <Form.Item label="ID">
          <Input value={node.id} disabled style={{ fontFamily: 'var(--font-mono)' }} />
        </Form.Item>
        <Form.Item label="标签">
          <RequiredLabelInput
            key={`${node.id}-${node.label}`}
            label={node.label}
            onCommit={(label) => updateNode(node.id, { label })}
          />
        </Form.Item>
        <Form.Item label="位置 X">
          <Input
            type="number"
            value={Math.round(node.x)}
            onChange={(e) => updateNode(node.id, { x: Number(e.target.value) })}
          />
        </Form.Item>
        <Form.Item label="位置 Y">
          <Input
            type="number"
            value={Math.round(node.y)}
            onChange={(e) => updateNode(node.id, { y: Number(e.target.value) })}
          />
        </Form.Item>

        <Form.Item label="URI">
          <Input
            value={node.uri || ''}
            onChange={(e) => updateNode(node.id, { uri: e.target.value })}
            placeholder="http://example.org/resource/..."
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </Form.Item>
        <Form.Item label="类型">
          <Input
            value={node.rdfType || ''}
            onChange={(e) => updateNode(node.id, { rdfType: e.target.value })}
            placeholder="rdfs:Resource"
            style={{ fontFamily: 'var(--font-mono)' }}
          />
        </Form.Item>
        <Form.Item label="属性">
          <PropertyEditor
            properties={node.properties || {}}
            onChange={(props) => updateNode(node.id, { properties: props })}
          />
        </Form.Item>
      </Form>
    </div>
  );
};

export default NodeEditor;
