# Config Entry Bridge

[🇬🇧 English](README.md) · **🇩🇪 Deutsch**

Eine Home-Assistant-Komponente, die das hinter dem Zahnrad versteckte Recht für die Optionen eines Konfigurationseintrags erweitert, damit auch normale Benutzer Einstellungen einer Integration sehen und ändern können.

Home Assistant erlaubt nur Administratoren, die Einstellungen (das Zahnrad) eines Konfigurationseintrags zu öffnen oder ihn neu zu laden. Diese Integration lässt einen Administrator genau diese beiden Rechte pro Konfigurationseintrag an ausgewählte Personen vergeben, ohne sie zu Administratoren zu machen. Sie ist das Gegenstück zur [Config Entry Card](https://github.com/seb5594/Home-Assistant-Config-Entry-Lovelace-Card), die Eintrag, Geräte und Buttons auf einem Dashboard zeigt.

## Installation

Installiere sie über HACS (Badge im [englischen README](README.md)), starte Home Assistant neu und füge **Config Entry Bridge** unter **Einstellungen → Geräte & Dienste** hinzu. Es gibt nichts zu konfigurieren.

## So funktioniert es

- Ein Administrator vergibt `configure` und/oder `reload` für einen Konfigurationseintrag an eine *Person*. Die Rechte speichert die Integration selbst, nicht ein Dashboard.
- Jeder Aufruf wird serverseitig geprüft: Aufrufer ist der angemeldete Benutzer der WebSocket-Verbindung, zugeordnet über seine Person-Entität. Ein im Browser verändertes Dashboard kann ein Recht nicht erweitern.
- Das Zahnrad startet denselben Optionen-Flow, den Home Assistant für Administratoren startet. Ein Flow kann nur von dem Benutzer fortgesetzt werden, der ihn gestartet hat.
- Administratoren dürfen immer alles und verwalten die Rechte.

## Einschränkungen

- Wer `configure` bekommt, kann jede Option der Integration ändern. Vergib es, als würdest du jemandem einen Schraubendreher in die Hand geben.
- Abgedeckt sind nur Optionen-Flows, nicht Neukonfigurieren, Untereinträge, Umbenennen, Deaktivieren oder Löschen.
- Rechte eines gelöschten Konfigurationseintrags bleiben in der Speicherdatei, bis das Recht entfernt wird; sie haben keine Wirkung.
- Benötigt Home Assistant 2026.9 oder neuer. Die Rechteregeln und der ganze Ablauf (vergeben, starten, senden, speichern, verweigern) laufen in der CI gegen echte Home-Assistant-Releases.
