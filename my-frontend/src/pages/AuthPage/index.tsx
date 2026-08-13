import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Checkbox, Form, Input, Tabs, message } from 'antd';
import {
  ArrowRight,
  LockKeyhole,
  Mail,
  Network,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { getApiErrorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/useAuthStore';
import type { LoginRequest, RegisterRequest } from '@/types/auth';
import './index.css';

function getSafeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
}

const emailRules = [
  { required: true, message: '请输入邮箱' },
  { type: 'email' as const, message: '请输入有效邮箱' },
];

const passwordRules = [
  { required: true, message: '请输入密码' },
  { min: 8, message: '密码至少 8 位' },
  {
    pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
    message: '密码需要同时包含字母和数字',
  },
];

const usernameRules = [
  { required: true, message: '请输入用户名' },
  { min: 3, message: '用户名至少 3 位' },
  { max: 64, message: '用户名最多 64 位' },
  {
    pattern: /^[A-Za-z0-9_-]+$/,
    message: '用户名只能包含字母、数字、下划线和连字符',
  },
];

function getInitialMode(value: string | null): string {
  return value === 'register' ? 'register' : 'login';
}

const AuthPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, register } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirect = getSafeRedirect(searchParams.get('redirect'));
  const initialTab = getInitialMode(searchParams.get('mode'));

  const handleLogin = async (values: LoginRequest) => {
    setIsSubmitting(true);
    try {
      await login({
        email: values.email.trim(),
        password: values.password,
        rememberMe: values.rememberMe ?? true,
      });
      message.success('登录成功');
      navigate(redirect, { replace: true });
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (values: RegisterRequest) => {
    setIsSubmitting(true);
    try {
      await register({
        email: values.email.trim(),
        password: values.password,
        username: values.username.trim(),
        displayName: values.displayName?.trim() || undefined,
      });
      message.success('注册成功');
      navigate(redirect, { replace: true });
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page paper-texture">
      <div className="auth-shell">
        <section className="auth-intro" aria-label="系统介绍">
          <div className="auth-brand-mark">
            <Network size={28} />
          </div>
          <p className="auth-eyebrow">
            <Sparkles size={14} />
            知识图谱设计系统
          </p>
          <h1>进入你的图谱工作台</h1>
          <p className="auth-copy">
            登录后即可继续管理项目、编辑图谱，并使用助手和 GraphRAG 检索自己的知识网络。
          </p>
        </section>

        <section className="auth-panel" aria-label="登录注册表单">
          <Tabs
            key={initialTab}
            defaultActiveKey={initialTab}
            items={[
              {
                key: 'login',
                label: '登录',
                children: (
                  <Form
                    layout="vertical"
                    initialValues={{ rememberMe: true }}
                    onFinish={handleLogin}
                    className="auth-form"
                  >
                    <Form.Item label="邮箱" name="email" rules={emailRules}>
                      <Input
                        prefix={<Mail size={16} />}
                        placeholder="user@example.com"
                        autoComplete="email"
                      />
                    </Form.Item>

                    <Form.Item
                      label="密码"
                      name="password"
                      rules={[{ required: true, message: '请输入密码' }]}
                    >
                      <Input.Password
                        prefix={<LockKeyhole size={16} />}
                        placeholder="请输入密码"
                        autoComplete="current-password"
                      />
                    </Form.Item>

                    <Form.Item
                      name="rememberMe"
                      valuePropName="checked"
                      className="auth-checkbox-row"
                    >
                      <Checkbox>保持登录</Checkbox>
                    </Form.Item>

                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={isSubmitting}
                      className="auth-submit"
                    >
                      登录
                      <ArrowRight size={16} />
                    </Button>
                  </Form>
                ),
              },
              {
                key: 'register',
                label: '注册',
                children: (
                  <Form
                    layout="vertical"
                    onFinish={handleRegister}
                    className="auth-form"
                  >
                    <Form.Item label="邮箱" name="email" rules={emailRules}>
                      <Input
                        prefix={<Mail size={16} />}
                        placeholder="user@example.com"
                        autoComplete="email"
                      />
                    </Form.Item>

                    <Form.Item
                      label="用户名"
                      name="username"
                      rules={usernameRules}
                    >
                      <Input
                        prefix={<UserRound size={16} />}
                        placeholder="graph_user"
                        autoComplete="username"
                      />
                    </Form.Item>

                    <Form.Item label="展示名称" name="displayName">
                      <Input placeholder="图谱用户" autoComplete="name" />
                    </Form.Item>

                    <Form.Item
                      label="密码"
                      name="password"
                      rules={passwordRules}
                    >
                      <Input.Password
                        prefix={<LockKeyhole size={16} />}
                        placeholder="至少 8 位，包含字母和数字"
                        autoComplete="new-password"
                      />
                    </Form.Item>

                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={isSubmitting}
                      className="auth-submit"
                    >
                      创建账号
                      <ArrowRight size={16} />
                    </Button>
                  </Form>
                ),
              },
            ]}
          />
        </section>
      </div>
    </div>
  );
};

export default AuthPage;
