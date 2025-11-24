# HPC Connector - Technical Overview

VSCode extension per sottomettere ed eseguire codice su cluster HPC SLURM (UniBo).

## Struttura del Progetto

```
hpc-connector/
├── extension.js              # Entry point dell'estensione
├── package.json             # Configurazione VSCode extension
├── src/
│   ├── clusterManager.js    # Gestisce operazioni cluster e ciclo vita job
│   ├── storageManager.js    # Gestisce storage locale job (workspace-specific)
│   ├── configManager.js     # Gestisce configurazione VSCode
│   ├── connectionManager.js # Gestisce connessione SSH (retry, keepalive)
│   ├── scriptBuilder.js     # Genera script SLURM batch
│   ├── uiManager.js         # Gestisce interazioni UI con utente
│   ├── logger.js            # Logging su file (workspace-aware)
│   ├── safetyManager.js     # Validazione path (security)
│   └── executors/
│       ├── baseExecutor.js      # Classe base per executors
│       ├── pythonExecutor.js    # Executor per .py e .ipynb
│       ├── cppExecutor.js       # Executor per .c e .cpp
│       └── executorFactory.js   # Factory per creare executors
```

## Storage dei Job

I job sono ora salvati **per workspace** invece che globalmente:

- **Con workspace aperto**: `.vscode/.hpc-connector/jobs.json`
- **Senza workspace**: Chiede all'utente dove salvare i dati
- **Logs**: Nella stessa directory `.vscode/.hpc-connector/logs/`

Questo permette di avere job separati per ogni progetto.

## Architettura Modulare

### ClusterManager
Orchestratore principale che coordina:
- Sottomissione job a SLURM
- Monitoraggio stato job
- Download risultati
- Pulizia file remoti
- Persistenza metadati (via StorageManager)

### StorageManager
Gestisce lo storage locale workspace-specific:
- Inizializzazione directory storage
- Caricamento/salvataggio jobs.json
- Gestione directory risultati
- CRUD operations su job

### ConnectionManager
Gestione avanzata connessione SSH:
- Auto-retry con exponential backoff
- Connection pooling e reuse
- Health checks periodici
- Caricamento automatico chiavi SSH
- Error handling dettagliato

### ScriptBuilder
Costruzione script SLURM:
- Genera header con direttive #SBATCH
- Setup environment (moduli, venv)
- Comandi esecuzione (via executors)
- Cattura output e metadata
- Crea status.json con risultati

### Executors
Pattern Strategy per gestire diversi tipi di file:
- **PythonExecutor**: Script .py e notebook .ipynb
- **CppExecutor**: Programmi .c e .cpp con compilazione
- Ognuno sa come eseguire il proprio tipo di file
- Validazione configurazione specifica

### UIManager
Gestione UI pulita:
- Dialog per input utente
- Progress notifications
- Job picker e details view
- Error/success messages

### ConfigManager
Accesso centralizzato a settings VSCode:
- Parametri connessione cluster
- Default job resources
- Validazione configurazione

### SafetyManager
Sicurezza operazioni:
- Validazione path (no traversal)
- Solo operazioni in /scratch.hpc/username/
- Audit log delle operazioni

## Flusso Tipico

1. **Submit Job**:
   - Utente apre file (.py, .cpp, etc)
   - Extension valida tipo file
   - Chiede parametri job (risorse, env, etc)
   - ClusterManager crea directory remota
   - Upload file principale + input files
   - ScriptBuilder genera SLURM script
   - Submit a SLURM queue
   - Salva metadata in StorageManager

2. **Monitor Job**:
   - ClusterManager interroga `squeue` per job attivi
   - Legge `status.json` per job completati
   - Aggiorna stato in jobs.json locale

3. **Download Results**:
   - StorageManager crea directory in `.vscode/.hpc-connector/results/`
   - ConnectionManager scarica ricorsivamente directory remota
   - Mostra path locale all'utente

## File Types Supportati

- **.py**: Python scripts con venv
- **.ipynb**: Jupyter notebooks (eseguiti con nbconvert)
- **.c**: Programmi C (compilati con gcc)
- **.cpp**: Programmi C++ (compilati con g++)

## Configurazione

Settings in VSCode (`settings.json`):
```json
{
  "hpc-connector.clusterHost": "hpc.example.com",
  "hpc-connector.username": "user@domain.com",
  "hpc-connector.sshPort": 22,
  "hpc-connector.pythonEnv": "base_env",
  "hpc-connector.defaultPartition": "l40",
  "hpc-connector.defaultGPUs": 1,
  "hpc-connector.defaultCPUs": 4,
  "hpc-connector.defaultMemory": "16G",
  "hpc-connector.defaultTime": "02:00:00"
}
```

## Note Tecniche

### Retry Logic
ConnectionManager implementa retry automatico:
- Max 3 tentativi per operazione
- Exponential backoff (2s, 4s, 8s) + jitter
- No retry per errori di autenticazione
- Timeout: 30s per connessione, 60s per comandi

### Job ID Format
`YYYY-MM-DDTHH-MM-SS-mmm` (timestamp ISO con millisecondi)
Garantisce unicità e ordinamento cronologico.

### Remote Paths
Tutti i path remoti sono validati da SafetyManager:
- Base: `/scratch.hpc/username/`
- Jobs: `/scratch.hpc/username/hpc_jobs/`
- Venvs: `/scratch.hpc/username/python_venvs/`

### Status Tracking
Job status può essere:
- `PENDING`: In coda SLURM
- `RUNNING`: In esecuzione
- `COMPLETED`: Terminato con successo
- `FAILED`: Terminato con errore
- `UNKNOWN`: Stato non determinabile

## Sviluppo Futuro

Possibili migliorie:
- Support per altri linguaggi (R, Julia, etc)
- Monitoring real-time dei job in corso
- Template personalizzati per job ricorrenti
- Integration con Jupyter per sviluppo interattivo
- Gestione automatica dipendenze Python
