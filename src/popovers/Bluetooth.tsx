import { BatteryFull, BatteryLow, BatteryMedium, Bluetooth as BluetoothIcon, BluetoothOff, Gamepad2, Headphones, Keyboard, Mouse, Smartphone } from "lucide-react";
import { ipc, type BluetoothDevice } from "../lib/ipc";
import { useBluetooth } from "../hooks/useSystem";
import { ActionFooter } from "../ui/ActionFooter";
import { Switch } from "../ui/Switch";
import { useT } from "../i18n";

const KIND_ICONS = { audio: Headphones, mouse: Mouse, keyboard: Keyboard, gamepad: Gamepad2, phone: Smartphone, other: BluetoothIcon };

function Device({ device }: { device: BluetoothDevice }) {
  const t = useT().bluetooth;
  const Icon = KIND_ICONS[device.kind];
  const level = device.battery;
  const Battery = level === null ? null : level > 70 ? BatteryFull : level > 30 ? BatteryMedium : BatteryLow;
  return (
    <li className="bt-device">
      <span className="bt-device-icon" aria-hidden>
        <Icon size={16} strokeWidth={1.8} />
      </span>
      <span className="list-main">
        <span className="bt-device-name">{device.name}</span>
        <span className="bt-device-kind">{t.kinds[device.kind]}</span>
      </span>
      {Battery && (
        <span className="bt-battery" aria-label={t.battery(level!)}>
          <Battery size={16} strokeWidth={1.8} aria-hidden />
          {level}%
        </span>
      )}
    </li>
  );
}

export function BluetoothPanel() {
  const [bt, setPowered] = useBluetooth(true, 5_000);
  const t = useT().bluetooth;
  const devices = bt?.devices ?? [];

  const empty = (Icon: typeof BluetoothIcon, title: string, sub: string) => (
    <div className="popover-empty">
      <span className="empty-icon">
        <Icon size={22} strokeWidth={1.8} />
      </span>
      <span className="empty-title">{title}</span>
      <span className="empty-sub">{sub}</span>
    </div>
  );

  let body;
  if (!bt) body = <span className="popover-loading">…</span>;
  else if (!bt.available) body = empty(BluetoothOff, t.unavailable, t.unavailableSub);
  else if (!bt.powered) body = empty(BluetoothOff, t.off, t.offSub);
  else if (!devices.length) body = empty(BluetoothIcon, t.none, t.noneSub);
  else
    body = (
      <>
        <span className="eyebrow bt-eyebrow">{t.connected}</span>
        <ul className="list bt-list">
          {devices.map((d) => (
            <Device key={d.name} device={d} />
          ))}
        </ul>
      </>
    );

  const status = !bt?.available ? "" : !bt.powered ? t.offShort : devices.length ? t.connectedCount(devices.length) : t.on;
  return (
    <>
      <div className="popover-header">
        <span className="popover-heading bt-heading">Bluetooth</span>
        {bt?.available && bt.canToggle && <Switch checked={bt.powered} label="Bluetooth" onChange={setPowered} />}
      </div>
      <div className="bt-body">{body}</div>
      <ActionFooter context={status} actions={[{ label: t.settings, keys: "↵", onClick: () => ipc.openShell("bluetooth") }]} />
    </>
  );
}
