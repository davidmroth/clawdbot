import { html, nothing } from "lit";

import { formatAgo } from "../format";
import type { SignalStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { renderChannelConfigSection } from "./channels.config";

export function renderSignalCard(params: {
  props: ChannelsProps;
  signal?: SignalStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, signal, accountCountLabel } = params;

  return html`
    <div class="card">
      <div class="card-title">Signal</div>
      <div class="card-sub">signal-cli status and channel configuration.</div>
      ${accountCountLabel}

      <div class="status-list" style="margin-top: 16px;">
        <div>
          <span class="label">Configured</span>
          <span>${signal?.configured ? "Yes" : "No"}</span>
        </div>
        <div>
          <span class="label">Running</span>
          <span>${signal?.running ? "Yes" : "No"}</span>
        </div>
        <div>
          <span class="label">Base URL</span>
          <span>${signal?.baseUrl ?? "n/a"}</span>
        </div>
        <div>
          <span class="label">Last start</span>
          <span
            >${signal?.lastStartAt
              ? formatAgo(signal.lastStartAt)
              : "n/a"}</span
          >
        </div>
        <div>
          <span class="label">Last probe</span>
          <span
            >${signal?.lastProbeAt
              ? formatAgo(signal.lastProbeAt)
              : "n/a"}</span
          >
        </div>
      </div>

      ${signal?.lastError
        ? html`<div class="callout danger" style="margin-top: 12px;">
            ${signal.lastError}
          </div>`
        : nothing}
      ${signal?.probe
        ? html`<div class="callout" style="margin-top: 12px;">
            Probe ${signal.probe.ok ? "ok" : "failed"} ·
            ${signal.probe.status ?? ""} ${signal.probe.error ?? ""}
          </div>`
        : nothing}
      ${props.signalLinkMessage
        ? html`<div class="callout" style="margin-top: 12px;">
            ${props.signalLinkMessage}
          </div>`
        : nothing}
      ${props.signalQrDataUrl
        ? html`<div
            id="signal-qr-code"
            class="qr-wrap"
            style="margin-top: 12px;"
          >
            <img
              src=${props.signalQrDataUrl}
              alt="Signal QR"
              style="max-width: 256px;"
            />
            <div style="margin-top: 8px; font-size: 0.85em; color: #666;">
              Scan with Signal mobile: Settings → Linked Devices → +
            </div>
          </div>`
        : nothing}
      ${renderChannelConfigSection({ channelId: "signal", props })}

      <div class="row" style="margin-top: 12px;">
        <button
          class="btn primary"
          ?disabled=${props.signalLinkBusy}
          @click=${() => props.onSignalLink()}
        >
          ${props.signalLinkBusy ? "Linking…" : "Link Device"}
        </button>
        <button class="btn" @click=${() => props.onRefresh(true)}>Probe</button>
      </div>
    </div>
  `;
}
