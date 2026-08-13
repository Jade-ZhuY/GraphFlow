import React, { useState } from 'react';
import { Modal, Form, Radio, Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import * as projectApi from '@/services/projectApi';
import { getApiErrorMessage } from '@/services/http';

interface ImportProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

type ImportFormat = 'turtle' | 'jsonld' | 'json';

const ImportProjectDialog: React.FC<ImportProjectDialogProps> = ({
  open,
  onClose,
  onImported,
}) => {
  const [form] = Form.useForm<{ format: ImportFormat }>();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const uploadProps: UploadProps = {
    beforeUpload: (f) => {
      setFile(f);
      return false; // 阻止自动上传，由按钮触发
    },
    onRemove: () => setFile(null),
    fileList: file ? [file as never] : [],
    maxCount: 1,
  };

  const reset = () => {
    setFile(null);
    form.resetFields();
  };

  const handleImport = async () => {
    if (!file) {
      message.warning('请选择文件');
      return;
    }
    const values = await form.validateFields();
    setImporting(true);
    try {
      await projectApi.importProject(file, values.format);
      message.success('导入成功');
      reset();
      onClose();
      onImported();
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      title="导入项目"
      open={open}
      onOk={handleImport}
      confirmLoading={importing}
      onCancel={() => {
        reset();
        onClose();
      }}
      okText="导入"
      cancelText="取消"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ format: 'json' }}>
        <Form.Item
          label="文件格式"
          name="format"
          rules={[{ required: true }]}
          tooltip="Turtle / JSON-LD 用于 RDF 格式；JSON 用于属性图格式"
        >
          <Radio.Group>
            <Radio value="turtle">Turtle</Radio>
            <Radio value="jsonld">JSON-LD</Radio>
            <Radio value="json">JSON</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item label="文件" required>
          <Upload {...uploadProps} accept=".ttl,.jsonld,.json">
            <Button icon={<UploadOutlined />}>选择文件</Button>
          </Upload>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ImportProjectDialog;
