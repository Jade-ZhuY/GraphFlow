import { Avatar, Button, Dropdown, message, type MenuProps } from 'antd';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/useAuthStore';
import './index.css';

const UserMenu = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  if (!user) return null;

  const displayName = user.displayName || user.username || user.email;

  const items: MenuProps['items'] = [
    {
      key: 'profile',
      disabled: true,
      label: (
        <div className="user-menu-profile">
          <strong>{displayName}</strong>
          <span>{user.email}</span>
        </div>
      ),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogOut size={15} />,
      label: '退出登录',
      danger: true,
    },
  ];

  const handleMenuClick: MenuProps['onClick'] = async ({ key }) => {
    if (key !== 'logout') return;

    try {
      await logout();
      message.success('已退出登录');
    } catch (error) {
      message.warning(getApiErrorMessage(error));
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <Dropdown
      menu={{ items, onClick: handleMenuClick }}
      trigger={['click']}
      placement="bottomRight"
    >
      <Button type="text" className="user-menu-trigger">
        <Avatar size={28} className="user-menu-avatar">
          <UserRound size={15} />
        </Avatar>
        <span className="user-menu-name">{displayName}</span>
        <ChevronDown size={14} />
      </Button>
    </Dropdown>
  );
};

export default UserMenu;
