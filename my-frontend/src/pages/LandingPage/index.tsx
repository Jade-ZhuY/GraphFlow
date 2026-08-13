import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import {
  Network,
  Sparkles,
  MessageSquareQuote,
  Layers,
  ArrowRight,
  Search,
} from 'lucide-react';
import UserMenu from '@/components/UserMenu';
import { useAuthStore } from '@/stores/useAuthStore';
import './index.css';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    user,
    isAuthenticated,
    isBootstrapping,
    hasBootstrapped,
    bootstrap,
  } = useAuthStore();

  useEffect(() => {
    if (!hasBootstrapped && !isBootstrapping) {
      void bootstrap();
    }
  }, [bootstrap, hasBootstrapped, isBootstrapping]);

  return (
    <div className="landing-page paper-texture">
      <header className="landing-header">
        <button
          type="button"
          className="landing-brand"
          onClick={() => navigate('/')}
          aria-label="知识图谱设计系统首页"
        >
          <span className="landing-brand-icon">
            <Network size={22} />
          </span>
          <span className="landing-brand-text">
            <strong>知识图谱设计系统</strong>
            <span>Knowledge Graph Studio</span>
          </span>
        </button>

        <div
          className="landing-auth-actions"
          aria-label={isAuthenticated ? '用户菜单' : '登录注册入口'}
        >
          {isAuthenticated && user ? (
            <UserMenu />
          ) : isBootstrapping && !hasBootstrapped ? (
            <span className="landing-auth-loading">正在检查登录状态</span>
          ) : (
            <>
              <Button
                className="landing-login-btn"
                onClick={() => navigate('/login?mode=login')}
              >
                登录 / log in
              </Button>
              <Button
                type="primary"
                className="landing-signup-btn"
                onClick={() => navigate('/login?mode=register')}
              >
                注册 / sign up
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="landing-hero">
        <div className="hero-badge">
          <Sparkles size={14} className="badge-icon" />
          <span>知识图谱 · 可视化设计 · 智能咨询</span>
        </div>

        <h1 className="hero-title">
          <span className="hero-title-line">知识图谱设计系统</span>
          <span className="hero-title-sub">
            从构思到可视化，构建属于你的知识宇宙
          </span>
        </h1>

        <p className="hero-desc">
          一个温润而强大的知识图谱工作台。在这里，你可以自由绘制节点与关系，
          <br />
          也可以在设计之前向图谱助手寻求完整方案，让每一次建模都有据可依。
        </p>

        <div className="hero-actions">
          <Button
            type="primary"
            size="large"
            className="hero-btn hero-btn-primary"
            onClick={() => navigate('/projects')}
          >
            <Network size={18} />
            <span>知识图谱设计</span>
            <ArrowRight size={16} className="btn-arrow" />
          </Button>

          <Button
            size="large"
            className="hero-btn hero-btn-secondary"
            onClick={() => navigate('/assistant')}
          >
            <MessageSquareQuote size={18} />
            <span>图谱咨询助手</span>
          </Button>

          <Button
            size="large"
            className="hero-btn hero-btn-tertiary"
            onClick={() => navigate('/graphrag')}
          >
            <Search size={18} />
            <span>GraphRAG 检索</span>
          </Button>
        </div>
      </div>

      <div className="landing-features">
        <div className="feature-card" style={{ animationDelay: '0.1s' }}>
          <div className="feature-icon-wrap">
            <Network size={24} className="feature-icon" />
          </div>
          <h3 className="feature-title">可视化建模</h3>
          <p className="feature-body">
            基于力导向布局的交互式画布，拖拽即可绘制节点与关系，实时预览图谱结构。
          </p>
        </div>

        <div className="feature-card" style={{ animationDelay: '0.2s' }}>
          <div className="feature-icon-wrap">
            <Layers size={24} className="feature-icon" />
          </div>
          <h3 className="feature-title">RDF / PG 双模型</h3>
          <p className="feature-body">
            同时支持 RDF 三元组与 Property Graph 属性图，让语义网与图数据库场景各得其所。
          </p>
        </div>

        <div className="feature-card" style={{ animationDelay: '0.3s' }}>
          <div className="feature-icon-wrap">
            <Sparkles size={24} className="feature-icon" />
          </div>
          <h3 className="feature-title">智能设计咨询</h3>
          <p className="feature-body">
            在建图前先问助手。选型、Schema 设计、命名规范、性能优化，提供专业建议。
          </p>
        </div>

        <div className="feature-card" style={{ animationDelay: '0.4s' }}>
          <div className="feature-icon-wrap">
            <Search size={24} className="feature-icon" />
          </div>
          <h3 className="feature-title">GraphRAG 检索</h3>
          <p className="feature-body">
            基于已建图谱做关键词检索，让数据开口说话，快速获取实体关系答案。
          </p>
        </div>
      </div>

      <div className="landing-footer" style={{ animationDelay: '0.4s' }}>
        <p>从一张白纸开始，构建可理解的知识网络。</p>
      </div>

      <div className="landing-decoration" aria-hidden="true">
        <svg viewBox="0 0 800 600" className="deco-svg">
          <defs>
            <linearGradient id="decoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(212,101,42,0.18)" />
              <stop offset="100%" stopColor="rgba(232,168,56,0.08)" />
            </linearGradient>
          </defs>
          <circle cx="120" cy="120" r="8" fill="url(#decoGrad)" />
          <circle cx="260" cy="80" r="6" fill="url(#decoGrad)" />
          <circle cx="220" cy="200" r="10" fill="url(#decoGrad)" />
          <circle cx="680" cy="160" r="7" fill="url(#decoGrad)" />
          <circle cx="620" cy="300" r="9" fill="url(#decoGrad)" />
          <circle cx="740" cy="420" r="6" fill="url(#decoGrad)" />
          <line x1="120" y1="120" x2="260" y2="80" stroke="rgba(212,101,42,0.12)" strokeWidth="1.5" />
          <line x1="120" y1="120" x2="220" y2="200" stroke="rgba(212,101,42,0.12)" strokeWidth="1.5" />
          <line x1="260" y1="80" x2="220" y2="200" stroke="rgba(212,101,42,0.12)" strokeWidth="1.5" />
          <line x1="680" y1="160" x2="620" y2="300" stroke="rgba(212,101,42,0.12)" strokeWidth="1.5" />
          <line x1="620" y1="300" x2="740" y2="420" stroke="rgba(212,101,42,0.12)" strokeWidth="1.5" />
          <line x1="680" y1="160" x2="740" y2="420" stroke="rgba(212,101,42,0.12)" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
};

export default LandingPage;
