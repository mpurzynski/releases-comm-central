/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 * 
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Thunderbird Global Database.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Messaging, Inc.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Andrew Sutherland <asutherland@asutherland.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 * 
 * ***** END LICENSE BLOCK ***** */

/*
 * This file currently contains a fairly general implementation of asynchronous
 *  indexing with a very explicit message indexing implementation.  As gloda
 *  will eventually want to index more than just messages, the message-specific
 *  things should ideally lose their special hold on this file.  This will
 *  benefit readability/size as well.
 */

EXPORTED_SYMBOLS = ['GlodaIndexer'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gloda/modules/log4moz.js");

Cu.import("resource://gloda/modules/utils.js");
Cu.import("resource://gloda/modules/datastore.js");
Cu.import("resource://gloda/modules/gloda.js");
Cu.import("resource://gloda/modules/collection.js");

Cu.import("resource://gloda/modules/mimemsg.js");

// for list comprehension fun
function range(begin, end) {
  for (let i = begin; i < end; ++i) {
    yield i;
  }
}

// FROM STEEL (a la Joey Minta/jminta)
// (and to go away when STEEL is checked in, although we may also want to
//  consider just specializing the code in the few places this method is used.)
/**
 * This function will take a variety of xpcom iterators designed for c++ and turn
 * them into a nice JavaScript style object that can be iterated using for...in
 *
 * Currently, we support the following types of xpcom iterators:
 *   nsISupportsArray
 *   nsIEnumerator
 *   nsISimpleEnumerator
 *
 *   @param aEnum  the enumerator to convert
 *   @param aIface (optional) an interface to QI each object to prior to returning
 *
 *   @note This does *not* return an Array object.  It returns an object that can
 *         be use in for...in contexts only.  To create such an array, use
 *         var array = [a for (a in fixIterator(xpcomEnumerator))];
 */
function fixIterator(aEnum, aIface) {
  let face = aIface || Ci.nsISupports;
  // Try to QI our object to each of the known iterator types.  If the QI does
  // not throw, assign our iteration function
  try {
    aEnum.QueryInterface(Ci.nsISupportsArray);
    let iter = function() {
      let count = aEnum.Count();
      for (let i = 0; i < count; i++)
        yield aEnum.GetElementAt(i).QueryInterface(face);
    }
    return { __iterator__: iter };
  } catch(ex) {}
  
  // Now try nsIEnumerator
  try {
    aEnum.QueryInterface(Ci.nsIEnumerator);
    let done = false;
    let iter = function() {
      while (!done) {
        try {
          //rets.push(aEnum.currentItem().QueryInterface(face));
          yield aEnum.currentItem().QueryInterface(face);
          aEnum.next();
        } catch(ex) {
          done = true;
        }
      }
    };

    return { __iterator__: iter };
  } catch(ex) {}
  
  // how about nsISimpleEnumerator? this one is nice and simple
  try {
    aEnum.QueryInterface(Ci.nsISimpleEnumerator);
    let iter = function () {
      while (aEnum.hasMoreElements())
        yield aEnum.getNext().QueryInterface(face);
    }
    return { __iterator__: iter };
  } catch(ex) {}
}

/**
 * Capture the indexing batch concept explicitly.
 *
 * @param aJobType The type of thing we are indexing.  Current choices are:
 *   "folder" and "message".  Previous choices included "account".  The indexer
 *   currently knows too much about these; they should be de-coupled.
 * @param aDeltaType -1 for deletion, 0 for move, 1 for addition/new.
 * @param aID Specific to the job type, but for now only used to hold folder
 *     IDs.
 *
 * @ivar items The list of items to process during this job/batch.  (For
 *     example, if this is a "messages" job, this would be the list of messages
 *     to process, although the specific representation is determined by the
 *     job.)  The list will only be mutated through the addition of extra items.
 * @ivar offset The current offset into the 'items' list (if used), updated as
 *     processing occurs.  If 'items' is not used, the processing code can also
 *     update this in a similar fashion.  This is used by the status
 *     notification code in conjunction with goal.
 * @ivar goal The total number of items to index/actions to perform in this job.
 *     This number may increase during the life of the job, but should not
 *     decrease.  This is used by the status notification code in conjunction
 *     with the goal.
 */
function IndexingJob(aJobType, aDeltaType, aID) {
  this.jobType = aJobType;
  this.deltaType = aDeltaType;
  this.id = aID;
  this.items = [];
  this.offset = 0;
  this.goal = null;
}

/** Synchronous activities performed, you can drive us more. */
const kWorkSync = 0;
/**
 * Asynchronous activity performed, you need to relinquish flow control and
 *  trust us to call callbackDriver later.
 */
const kWorkAsync = 1;
/**
 * We are all done with our task, close us and figure out something else to do.
 */
const kWorkDone = 2;

/**
 * === Message Indexing
 * 
 * We are good at listening to nsIMsgFolderListener events.  Unfortunately,
 *  MailNews isn't pervasively thorough at generating these yet (newsgroups
 *  don't produce them, probably not RSS either.)  This provides us with
 *  message addition, moves/copies, and deletion.
 * We are not good at listening to nsIFolderListener events.  This means we fail
 *  to update ourselves when a message is changed because of a change in tags,
 *  read status/starred status/etc.  (Well, in fairness, events aren't actually
 *  generated in all of those cases either, yet, but we should try.)  We need
 *  to handle this.
 *
 * Currently, when we index a message, when it comes to attributes, we ignore
 *  all that has come before us and simply blow away the attributes and apply
 *  those provided by the attribute providers anew.  This is not particularly
 *  efficient for anyone.  Also, I think we probably screw this up now that we
 *  have object identity support.  Uh, so, this should be improved, but
 *  certainly works.
 *  
 * We are not sufficiently good at detaching our listeners so as to avoid
 *  crashes.  We want to hook the shutdown notification, but we don't.  We do
 *  try to hook database-is-going-away notifications, but it's really not
 *  tested.  We definitely do crash sometimes when you're shutting down.
 * 
 */
let GlodaIndexer = {
  /**
   * A partial attempt to generalize to support multiple databases.  Each
   *  database would have its own datastore would have its own indexer.  But
   *  we rather inter-mingle our use of this field with the singleton global
   *  GlodaDatastore.
   */
  _datastore: GlodaDatastore,
  _log: Log4Moz.Service.getLogger("gloda.indexer"),
  /**
   * Our nsITimer that we use to schedule ourselves on the main thread
   *  intermittently.  The timer always exists but may not always be active.
   */
  _timer: null,

  _inited: false,
  /**
   * Initialize the indexer.
   */
  _init: function gloda_index_init() {
    if (this._inited)
      return;
    
    this._inited = true;
    
    // create the timer that drives our intermittent indexing
    this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);

    // register for:
    // - folder loaded events, so we know when updateFolder has finished
    //   updating the index/what not (if it was't immediately available)
    // - property changes (so we know when a message's read/starred state have
    //   changed.)
    let mailSession = Cc["@mozilla.org/messenger/services/session;1"].
                        getService(Ci.nsIMsgMailSession);
    this._folderListener._init(this);
    mailSession.AddFolderListener(this._folderListener,
                                  Ci.nsIFolderListener.propertyFlagChanged |
                                  Ci.nsIFolderListener.event);

    // register for shutdown notification
    let observerService = Cc["@mozilla.org/observer-service;1"].
                            getService(Ci.nsIObserverService);
    observerService.addObserver(this, "xpcom-shutdown", false);

    // figure out if event-driven indexing should be enabled...
    let prefService = Cc["@mozilla.org/preferences-service;1"].
                        getService(Ci.nsIPrefService);
    let branch = prefService.getBranch("mailnews.database.global.indexer");
    let eventDrivenEnabled = true; // default
    if (branch.prefHasUserValue("enabled"))
      eventDrivenEnabled = branch.getBoolPref("enabled");
    this.enabled = eventDrivenEnabled;
  },
  
  _shutdown: function gloda_index_shutdown() {
    this._log.info("Shutting Down");

    this.enabled = false;
    this._indexerLeaveFolder(); // nop if we aren't "in" a folder
    
    let mailSession = Cc["@mozilla.org/messenger/services/session;1"].
                        getService(Ci.nsIMsgMailSession);
    mailSession.RemoveFolderListener(this._folderListener);
  },
  
  /**
   * Are we enabled, read: are we processing change events?
   */
  _enabled: false,
  get enabled() { return this._enabled; },
  set enabled(aEnable) {
    if (!this._enabled && aEnable) {
      this._msgFolderListener.indexer = this;
      
      let notificationService =
        Cc["@mozilla.org/messenger/msgnotificationservice;1"].
        getService(Ci.nsIMsgFolderNotificationService);
      notificationService.addListener(this._msgFolderListener,
                                      Ci.nsIMsgFolderNotificationService.all);
      
      this._enabled = true;
    }
    else if (this._enabled && !aEnable) {
      let notificationService =
        Cc["@mozilla.org/messenger/msgnotificationservice;1"].
        getService(Ci.nsIMsgFolderNotificationService);
      notificationService.removeListener(this._msgFolderListener);
      
      this._enabled = false;
    }
    
    this._log.info("Event-Driven Indexing is now " + this._enabled);
  },

  /** Track whether indexing is active (we have timers in-flight). */
  _indexingActive: false,
  /** Indicates whether indexing is active or not. */
  get indexing() { return this._indexingActive; },
  /** You can turn on indexing, but you can't turn it off! */
  set indexing(aShouldIndex) {
    if (!this._indexingActive && aShouldIndex) {
      this._log.info("+++ Indexing Queue Processing Commencing");
      this._indexingActive = true;
      this._timer.initWithCallback(this._wrapCallbackDriver,
                                   this._indexInterval,
                                   Ci.nsITimer.TYPE_ONE_SHOT);
    }  
  },
  
  /**
   * Our current job number, out of _indexingJobGoal.  Although our jobs comes
   *  from _indexQueue, this is not an offset into that list because we forget
   *  jobs once we complete them.  As such, this value is strictly for progress
   *  tracking.
   */ 
  _indexingJobCount: 0,
  /**
   * Total number of jobs to process in this current indexing session; may
   *  increase as new jobs are added to the _indexQueue.  This value won't
   *  decrease until the indexing session is completed (and we become idle),
   *  and then it will go to zero.
   */
  _indexingJobGoal: 0,
  
  /**
   * A list of IndexingJob instances to process.
   * - ['account', account object]
   * - ['folder', folder URI]
   * - ['message', delta type, message header, folder ID, message key,
   *      message ID]
   *   (we use folder ID instead of URI so that renames can't trick us)
   */
  _indexQueue: [],
  
  /**
   * The current indexing job.
   */
  _curIndexingJob: null,
  
  /**
   * A message addition job yet to be (completely) processed.  Since message
   *  addition events come to us one-by-one, in order to aggregate them into a
   *  job, we need something like this.  It's up to the indexing loop to
   *  decide when to null this out; it can either do it when it first starts
   *  processing it, or when it has processed the last thing.  It's really a
   *  question of whether we want retrograde motion in the folder progress bar
   *  or the message progress bar.
   */
  _pendingAddJob: null,
  
  /**
   * The time interval, in milliseconds between performing indexing work.
   *  This may be altered by user session (in)activity.
   */ 
  _indexInterval: 80,
  /**
   * Number of indexing 'tokens' we are allowed to consume before yielding for
   *  each incremental pass.  Consider a single token equal to indexing a single
   *  medium-sized message.  This may be altered by user session (in)activity.
   * Because we fetch message bodies, which is potentially asynchronous, this
   *  is not a precise knob to twiddle.
   */
  _indexTokens: 15,
  
  _indexListeners: [],
  /**
   * Add an indexing progress listener.  The listener will be notified of at
   *  least all major status changes (idle -> indexing, indexing -> idle), plus
   *  arbitrary progress updates during the indexing process.
   * If indexing is not active when the listener is added, a synthetic idle
   *  notification will be generated.
   *
   * @param aListener A listener function, taking arguments: status (Gloda.
   *     kIndexer*), the folder name if a folder is involved (string or null),
   *     current zero-based job number (int), total number of jobs (int),
   *     current item number being indexed in this job (int), total number
   *     of items in this job to be indexed (int).
   *
   * @TODO should probably allow for a 'this' value to be provided
   * @TODO generalize to not be folder/message specific.  use nouns!
   */
  addListener: function gloda_index_addListener(aListener) {
    // should we weakify?
    if (this._indexListeners.indexOf(aListener) == -1)
      this._indexListeners.push(aListener);
    // if we aren't indexing, give them an idle indicator, otherwise they can
    //  just be happy when we hit the next actual status point.
    if (!this.indexing)
      aListener(Gloda.kIndexerIdle, null, 0, 1, 0, 1);
    return aListener;
  },
  /**
   * Remove the given listener so that it no longer receives indexing progress
   *  updates.
   */
  removeListener: function gloda_index_removeListener(aListener) {
    let index = this._indexListeners.indexOf(aListener);
    if (index != -1)
      this._indexListeners.splice(index, 1);
  },
  /**
   * Helper method to tell listeners what we're up to.  For code simplicity,
   *  the caller is just deciding when to send this update (preferably at
   *  reasonable intervals), and doesn't need to provide any indication of
   *  state... we figure that out ourselves.
   */
  _notifyListeners: function gloda_index_notifyListeners() {
    let status, prettyName, jobIndex, jobTotal, jobItemIndex, jobItemGoal;
    
    if (this._indexingActive && this._curIndexingJob) {
      let job = this._curIndexingJob;
      if (job.deltaType > 0)
        status = Gloda.kIndexerIndexing;
      else if (job.deltaType == 0)
        status = Gloda.kIndexerMoving;
      else
        status = Gloda.kIndexerRemoving;
        
      let prettyName = (this._indexingFolder !== null) ?
                       this._indexingFolder.prettiestName : null;
      status = status + " " + prettyName;

      jobIndex = this._indexingJobCount-1;
      jobTotal = this._indexingJobGoal;
      jobItemIndex = job.offset;
      jobItemGoal  = job.goal;
    }
    else {
      status = Gloda.kIndexerIdle;
      prettyName = null;
      jobIndex = 0;
      jobTotal = 1;
      jobItemIndex = 0;
      jobItemGoal = 1;
    }
      
    for (let iListener=this._indexListeners.length-1; iListener >= 0; 
         iListener--) {
      let listener = this._indexListeners[iListener];
      listener(status, prettyName, jobIndex, jobTotal, jobItemIndex,
               jobItemGoal);
    }
  },
  
  _indexingFolderID: null,
  _indexingFolder: null,
  _indexingDatabase: null,
  _indexingIterator: null,
  
  /** folder whose entry we are pending on */
  _pendingFolderEntry: null,
  
  /**
   * Common logic that we want to deal with the given folder ID.  Besides
   *  cutting down on duplicate code, this ensures that we are listening on
   *  the folder in case it tries to go away when we are using it.
   *
   * @return true when the folder was successfully entered, false when we need
   *     to pend on notification of updating of the folder (due to re-parsing
   *     or what have you).  In the event of an actual problem, an exception
   *     will escape.
   */
  _indexerEnterFolder: function gloda_index_indexerEnterFolder(aFolderID,
                                                               aNeedIterator) {
    // if leave folder was't cleared first, remove the listener; everyone else
    //  will be nulled out in the exception handler below if things go south
    //  on this folder.
    if (this._indexingFolder !== null) {
      this._indexingDatabase.RemoveListener(this._databaseAnnouncerListener);
    }
    
    let folderURI = GlodaDatastore._mapFolderID(aFolderID);
    this._log.debug("Active Folder URI: " + folderURI);
  
    let rdfService = Cc['@mozilla.org/rdf/rdf-service;1'].
                     getService(Ci.nsIRDFService);
    let folder = rdfService.GetResource(folderURI);
    folder.QueryInterface(Ci.nsIMsgFolder); // (we want to explode in the try
    // if this guy wasn't what we wanted)
    this._indexingFolder = folder;
    this._indexingFolderID = aFolderID;

    // The msf may need to be created or otherwise updated, updateFolder will
    //  do this for us.  (GetNewMessages would also do it, but we would be
    //  triggering new message retrieval in that case, which we don't actually
    //  desire.
    // TODO: handle password-protected local cache potentially triggering a
    //  password prompt here...
    try {
      try {
        this._indexingFolder.updateFolder(null);
      }
      // on NS_ERROR_NOT_INITIALIZED
      catch ( e if e.result == 0xc1f30001) {
        // this means that we need to pend on the update.
        this._log.debug("Pending on folder load...");
        this._pendingFolderEntry = this._indexingFolder;
        this._indexingFolder = null;
        this._indexingFolderID = null;
        this._indexingDatabase = null;
        this._indexingIterator = null;
        return kWorkAsync;
      }
      // we get an nsIMsgDatabase out of this (unsurprisingly) which
      //  explicitly inherits from nsIDBChangeAnnouncer, which has the
      //  AddListener call we want.
      this._indexingDatabase = folder.getMsgDatabase(null);
      if (aNeedIterator)
        this._indexingIterator = fixIterator(
                                   //folder.getMessages(null),
                                   this._indexingDatabase.EnumerateMessages(),
                                   Ci.nsIMsgDBHdr);
      this._databaseAnnouncerListener.indexer = this;
      this._indexingDatabase.AddListener(this._databaseAnnouncerListener);
    }
    catch (ex) {
      this._log.error("Problem entering folder: " +
                      folder.prettiestName + ", skipping.");
      this._log.error("Error was: " + ex);
      this._indexingFolder = null;
      this._indexingFolderID = null;
      this._indexingDatabase = null;
      this._indexingIterator = null;
      
      // re-throw, we just wanted to make sure this junk is cleaned up and
      //  get localized error logging...
      throw ex;
    }
    
    return kWorkSync;
  },
  
  _indexerLeaveFolder: function gloda_index_indexerLeaveFolder(aExpected) {
    if (this._indexingFolder !== null) {
      // remove our listener!
      this._indexingDatabase.RemoveListener(this._databaseAnnouncerListener);
      // null everyone out
      this._indexingFolder = null;
      this._indexingFolderID = null;
      this._indexingDatabase = null;
      this._indexingIterator = null;
      // ...including the active job:
      this._curIndexingJob = null;
    }
  },
  
  /**
   * Event fed to us by our nsIFolderListener when a folder is loaded.  We use
   *  this event to two ends:
   *
   * - Know when a folder we were trying to open to index is actually ready to
   *   be indexed.  (The summary may have not existed, may have been out of
   *   date, or otherwise.)
   * - Know when 
   *
   * @param aFolder An nsIMsgFolder, already QI'd.
   */
  _onFolderLoaded: function gloda_index_onFolderLoaded(aFolder) {
    if ((this._pendingFolderEntry !== null) &&
        (aFolder.URI == this._pendingFolderEntry.URI)) {
      this._log.debug("...Folder Loaded!");
      this._pendingFolderEntry = null;
      this.callbackDriver();
    }
  },
  
  /**
   * A simple wrapper to make 'this' be right for incrementalIndex.
   */
  _wrapCallbackDriver: function gloda_index_wrapCallbackDriver() {
    GlodaIndexer.callbackDriver();
  },

  /**
   * The current processing 'batch' generator, produced by a call to workBatch()
   *  and used by callbackDriver to drive execution.
   */
  _batch: null,
  _inCallback: false,
  /**
   * The root work-driver.  callbackDriver creates workBatch generator instances
   *  (stored in _batch) which run until they are done (kWorkDone) or they
   *  (really the embedded _actualWorker) encounter something asynchronous.
   *  The convention is that all the callback handlers end up calling us,
   *  ensuring that control-flow properly resumes.  If the batch completes,
   *  we re-schedule ourselves after a time delay (controlled by _indexInterval)
   *  and return.  (We use one-shot timers because repeating-slack does not
   *  know enough to deal with our (current) asynchronous nature.)
   */
  callbackDriver: function gloda_index_callbackDriver() {
    // it is conceivable that someone we call will call something that in some
    //  cases might be asynchronous, and in other cases immediately generate
    //  events without returning.  In the interest of (stack-depth) sanity,
    //  let's handle this by performing a minimal time-delay callback.
    if (this._inCallback) {
      this._timer.initWithCallback(this._wrapCallbackDriver,
                                   0,
                                   Ci.nsITimer.TYPE_ONE_SHOT);
      return;
    }
    this._inCallback = true;

    try {
      if (this._batch === null)
        this._batch = this.workBatch();
      
      // only kWorkAsync and kWorkDone are allowed out of our call to the batch.
      // On kWorkDone, we want to schedule another timer to fire on us if we are
      //  not done indexing.  (On kWorkAsync, we don't care what happens, because
      //  someone else will be receiving the callback, and they will call us when
      //  they are done doing their thing.
      if (this._batch.next() == kWorkDone) {
        this._batch.close();
        this._batch = null;

        if (this.indexing)
          this._timer.initWithCallback(this._wrapCallbackDriver,
                                       this._indexInterval,
                                       Ci.nsITimer.TYPE_ONE_SHOT);
      }
    }
    finally {    
      this._inCallback = false;
    }
  },

  /**
   * The generator we are using to perform processing of the current job
   *  (this._curIndexingJob).  It differs from this._batch which is a generator
   *  that takes care of the batching logistics (namely managing database
   *  transactions and keeping track of how much work can be done with the
   *  current allocation of processing "tokens".
   * The generator is created by _hireJobWorker from one of the _worker_*
   *  generator methods.
   */
  _actualWorker: null,
  /**
   * The workBatch generator handles a single 'batch' of processing, managing
   *  the database transaction and keeping track of "tokens".  It drives the
   *  _actualWorker generator which is doing the work.
   * workBatch will only produce kWorkAsync and kWorkDone notifications.
   *  If _actualWorker returns kWorkSync and there are still tokens available,
   *  workBatch will keep driving _actualWorker until it encounters a
   *  kWorkAsync (which workBatch will yield to callbackDriver), or it runs
   *  out of tokens and yields a kWorkDone. 
   */
  workBatch: function gloda_index_workBatch() {
    GlodaDatastore._beginTransaction();

    for (let tokensLeft=this._indexTokens; tokensLeft > 0; tokensLeft--) {
      if ((this._actualWorker === null) && !this._hireJobWorker())
        break;
    
      // XXX for performance, we may want to move the try outside the for loop
      //  with a quasi-redundant outer loop that shunts control back inside
      //  if we left the loop due to an exception (without consuming all the
      //  tokens.)
      try {
        switch (this._actualWorker.next()) {
          case kWorkSync:
            break;
          case kWorkAsync:
            yield kWorkAsync;
            break;
          case kWorkDone:
            this._actualWorker.close();
            this._actualWorker = null;
            break;
        }
      }
      catch (ex) {
        this._log.debug("Bailing on job (at " + ex.fileName + ":" +
            ex.lineNumber + ") because: " + ex);
        this._indexerLeaveFolder(true);
        this._curIndexingJob = null;
        if (this._actualWorker !== null) {
          this._actualWorker.close();
          this._actualWorker = null;
        }
      }
    }
    // XXX doing the dirty commit/check every time could be pretty expensive...
    GlodaCollectionManager.cacheCommitDirty();
    GlodaDatastore._commitTransaction();
    
    // try and get a job if we don't have one for the sake of the notification
    if (this.indexing && (this._actualWorker === null))
      this._hireJobWorker();
    this._notifyListeners();
    
    yield kWorkDone;
  },

  /**
   * Perform the initialization step and return a generator if there is any
   *  steady-state processing to be had.
   */
  _hireJobWorker: function gloda_index_hireJobWorker() {
    if (this._indexQueue.length == 0) {
      this._log.info("--- Done indexing, disabling timer renewal.");
      
      if (this._indexingFolder !== null) {
        this._indexerLeaveFolder(true);
      }
      
      this._curIndexingJob = null;
      this._indexingActive = false;
      this._indexingJobCount = 0;
      this._indexingJobGoal = 0;
      return false;
    }

    this._log.debug("Pulling job from queue of size " +
                    this._indexQueue.length);
    let job = this._curIndexingJob = this._indexQueue.shift();
    this._indexingJobCount++;
    this._log.debug("Pulled job: " + job.jobType + ", " +
                    job.deltaType + ", " + job.id);
    let generator = null;
    
    if (job.jobType == "folder") {
      if (job.deltaType > 0)
        this._actualWorker = this._worker_folderAdd(job);
      else if (job.deltaType < 0)
        this._actualWorker = this._worker_folderDelete(job);
    }
    else if(job.jobType == "message") {
      if (job === this._pendingAddJob)
                  this._pendingAddJob = null;
      // update our goal from the items length
      job.goal = job.items.length;
                  
      if (job.deltaType > 0)
        this._actualWorker = this._worker_messageAdd(job);
      else if (job.deltaType == 0)
        this._actualWorker = this._worker_messageMove(job);
      else
        this._actualWorker = this._worker_messageDelete(job);
    }
    
    return true;
  },

  _worker_folderAdd: function (aJob) {
    yield this._indexerEnterFolder(aJob.id, true);
    aJob.goal = this._indexingFolder.getTotalMessages(false);
    
    for (let msgHdr in this._indexingIterator) {
      aJob.offset++;
      yield this._indexMessage(msgHdr);
    }
    
    yield kWorkDone;
  },
  
  _worker_folderDelete: function (aJob) {
    // nuke the folder id
    this._datastore.deleteFolderByID(aJob.id);
    yield kWorkDone;
  },
  
  _worker_messageAdd: function (aJob) {
    for (; aJob.offset < aJob.items.length; aJob.offset++) {
      let item = aJob.items[aJob.offset];
      // item is either [folder ID, message key] or
      //                [folder ID, message ID]

      // get in the folder
      if (this._indexingFolderID != item[0])
        yield this._indexerEnterFolder(item[0], false);

      let msgHdr;
      if (typeof item[1] == "number")
        msgHdr = this._indexingFolder.GetMessageHeader(item[1]);
      else
        // same deal as in move processing.
        // TODO fixme to not assume singular message-id's.
        msgHdr = this._indexingDatabase.getMsgHdrForMessageID(item[1]);
      
      if (msgHdr)
        yield this._indexMessage(msgHdr);
      else
        yield kWorkSync;
    }
    yield kWorkDone;
  },
  
  _worker_messageMove: function (aJob) {
    for (; aJob.offset < aJob.items.length; aJob.offset++) {
      let item = aJob.items[aJob.offset];
      // item must be [folder ID, header message-id]
      
      if (this._indexingFolderID != item[0])
        yield this._indexerEnterFolder(item[0], false);
      
      // process everyone with the message-id.  yeck.
      // uh, except nsIMsgDatabase only thinks there should be one, so
      //  let's pretend that this assumption is not a bad idea for now
      // TODO: stop pretending this assumption is not a bad idea
      let msgHdr = this._indexingDatabase.getMsgHdrForMessageID(item[1]);
      if (msgHdr)
        yield this._indexMessage(msgHdr);
      else {
        this._log.info("Move unable to locate message with header " +
          "message-id " + item[1] + ". Folder is known to possess " +
          this._indexingFolder.getTotalMessages(false) +" messages.");
        yield kWorkSync;
      }
    }
    
    yield kWorkDone;
  },
  
  /**
   * Handle the destruction (not just moved to trash) of one or more messages.
   */
  _worker_messageDelete: function (aJob) {
    for (; aJob.offset < aJob.items.length; aJob.offset++) {
      let item = aJob.items[aJob.offset];

      // item is either: a message id
      //              or [folder ID, message key]
      // we need to load the actual message because deletion may need to cascade
      //  to other tables, which requires us to actually have all of the details
      //  on the message available to us.
      let message;
      if (item instanceof Array) {
        if (this._indexingFolderID != item[0])
          yield this._indexerEnterFolder(item[0], false);
        let msgHdr = this._indexingFolder.GetMessageHeader(item[1]);
        let message = GlodaDatastore.getMessageFromLocation(msgHdr.folder.URI,
                                                            msgHdr.messageKey);
      }
      else
        message = GlodaDatastore.getMessageByID(item);

      // delete the message!
      if (message !== null)
        this._deleteMessage(message);
      yield kWorkSync;
    }
    yield kWorkDone;
  },

  /**
   * Queue all of the folders of all of the accounts of the current profile
   *  for indexing.  We traverse all folders and queue them immediately to try
   *  and have an accurate estimate of the number of folders that need to be
   *  indexed.  (We previously queued accounts rather than immediately
   *  walking their list of folders.)
   */
  indexEverything: function glodaIndexEverything() {
    this._log.info("Queueing all accounts for indexing.");
    let msgAccountManager = Cc["@mozilla.org/messenger/account-manager;1"].
                            getService(Ci.nsIMsgAccountManager);
    
    GlodaDatastore._beginTransaction();
    let sideEffects = [this.indexAccount(account) for each
                       (account in fixIterator(msgAccountManager.accounts,
                                               Ci.nsIMsgAccount))];
    GlodaDatastore._commitTransaction();
  },

  /**
   * Queue all of the folders belonging to an account for indexing.
   */
  indexAccount: function glodaIndexAccount(aAccount) {
    let rootFolder = aAccount.incomingServer.rootFolder;
    if (rootFolder instanceof Ci.nsIMsgFolder) {
      this._log.info("Queueing account folders for indexing: " + aAccount.key);

      GlodaDatastore._beginTransaction();
      let folderJobs =
              [new IndexingJob("folder", 1,
                              GlodaDatastore._mapFolderURI(folder.URI)) for each
              (folder in fixIterator(rootFolder.subFolders, Ci.nsIMsgFolder))];
      GlodaDatastore._commitTransaction();
      
      this._indexingJobGoal += folderJobs.length;
      this._indexQueue = this._indexQueue.concat(folderJobs);
      this.indexing = true;
    }
    else {
      this._log.info("Skipping Account, root folder not nsIMsgFolder");
    }
  },

  /**
   * Queue a single folder for indexing given an nsIMsgFolder.
   */
  indexFolder: function glodaIndexFolder(aFolder) {
    this._log.info("Queue-ing folder for indexing: " + aFolder.prettiestName);
    
    this._indexQueue.push(new IndexingJob("folder", 1,
                          GlodaDatastore._mapFolderURI(aFolder.URI)));
    this._indexingJobGoal++;
    this.indexing = true;
  },

  /**
   * Queue a single folder for indexing given its URI.
   */
  indexFolderByURI: function gloda_index_indexFolderByURI(aURI) {
    if (aURI !== null) {
      this._log.info("Queue-ing folder URI for indexing: " + aURI);
      
      this._indexQueue.push(new IndexingJob("folder", 1,
                            GlodaDatastore._mapFolderURI(aURI)));
      this._indexingJobGoal++;
      this.indexing = true;
    }
  },
  
  /**
   * Queue a list of messages for indexing.
   *
   * @param aFoldersAndMessages List of [nsIMsgFolder, message key] tuples.
   */
  indexMessages: function gloda_index_indexMessages(aFoldersAndMessages) {
    let job = new IndexingJob("message", 1, null);
    job.items = [[GlodaDatastore._mapFolderURI(fm[0].URI), fm[1]] for each
                 (fm in aFoldersAndMessages)];
    this._indexQueue.push(job);
    this._indexingJobGoal++;
    this.indexing = true;
  },
  
  /* *********** Event Processing *********** */
  observe: function gloda_indexer_observe(aSubject, aTopic, aData) {
    if (aTopic == "xpcom-shutdown") {
      GlodaIndexer._shutdown();
    }
  },

  /* ***** Folder Changes ***** */  
  /**
   * All additions and removals are queued for processing.  Indexing messages
   *  is potentially phenomenally expensive, and deletion can still be
   *  relatively expensive due to our need to delete the message, its
   *  attributes, and all attributes that reference it.  Additionally,
   *  attribute deletion costs are higher than attribute look-up because
   *  there is the actual row plus its 3 indices, and our covering indices are
   *  no help there.
   *  
   */
  _msgFolderListener: {
    indexer: null,
    
    /**
     * Handle a new-to-thunderbird message, meaning a newly fetched message
     *  (local folder) one revealed by synching with the server (IMAP).  Because
     *  the new-to-IMAP case requires Thunderbird to have opened the folder,
     *  we either need to depend on MailNews to be aggressive about looking
     *  for new messages in folders or try and do it ourselves.  For now, we
     *  leave it up to MailNews proper.
     *
     * For the time being, we post the message header as received to our
     *  indexing queue.  Depending on experience, it may be more suitable to
     *  try and index the message immediately, or hold onto a less specific
     *  form of message information than the nsIMsgDBHdr.  (If we were to
     *  process immediately, it might appropriate to consider having a
     *  transaction open that is commited by timer/sufficient activity, since it
     *  is conceivable we will see a number of these events in fairly rapid
     *  succession.)
     */
    msgAdded: function gloda_indexer_msgAdded(aMsgHdr) {
      this.indexer._log.debug("msgAdded notification");
      if (this.indexer._pendingAddJob === null) {
        this.indexer._pendingAddJob = new IndexingJob("message", 1, null);
        this.indexer._indexQueue.push(this.indexer._pendingAddJob);
        this.indexer._indexingJobGoal++;
      }
      this.indexer._pendingAddJob.items.push(
        [GlodaDatastore._mapFolderURI(aMsgHdr.folder.URI),
         aMsgHdr.messageKey]);
      this.indexer.indexing = true;
    },
    
    /**
     * Handle real, actual deletion (move to trash and IMAP deletion model
     *  don't count; we only see the deletion here when it becomes forever,
     *  or rather _just before_ it becomes forever.  Because the header is
     *  going away, we need to either process things immediately or extract the
     *  information required to purge it later without the header.
     *
     * We opt to process all of the headers immediately, inside a transaction.
     *  We do this because deletions may actually be a batch deletion of many,
     *  many messages, which could be a lot to queue
     */
    msgsDeleted: function gloda_indexer_msgsDeleted(aMsgHdrs) {
      this.indexer._log.debug("msgsDeleted notification");
      let deleteJob = new IndexingJob("message", -1, null);
      for (let iMsgHdr=0; iMsgHdr < aMsgHdrs.length; iMsgHdr++) {
        let msgHdr = aMsgHdrs.queryElementAt(iMsgHdr, Ci.nsIMsgDBHdr);
        deleteJob.items.push([GlodaDatastore._mapFolderURI(msgHdr.folder.URI),
                              msgHdr.messageKey]);
      }
      this.indexer._indexQueue.push(deleteJob);
      this.indexer._indexingJobGoal++;
      this.indexer.indexing = true;
    },
    
    /**
     * Process a move or copy.  Copies are treated as additions and accordingly
     *  queued for subsequent indexing.  Moves are annoying in that, in theory,
     *  we should be able to just alter the location information and be done
     *  with it.  Unfortunately, we have no clue what the messageKey is for
     *  the moved message until we go looking.  For now, we "simply" move the
     *  messages into the destination folder, wiping their message keys, and
     *  scheduling them all for re-indexing based on their message ids, which
     *  may catch some same-folder duplicates.
     *
     * @TODO Handle the move case better, avoiding a full reindexing of the
     *     messages when possible.  (In fact, the _indexMessage method basically
     *     has enough information to try and give this a whirl, but it's not
     *     foolproof, hence not done and this issue yet to-do.  
     */
    msgsMoveCopyCompleted: function gloda_indexer_msgsMoveCopyCompleted(aMove,
                             aSrcMsgHdrs, aDestFolder) {
      this.indexer._log.debug("MoveCopy notification.  Move: " + aMove);
      try {
      if (aMove) {
        let srcFolder = aSrcMsgHdrs.queryElementAt(0, Ci.nsIMsgDBHdr).folder;
        let messageKeys = [];

        let reindexJob = new IndexingJob("message", 0, null);

        // get the current (about to be nulled) messageKeys and build the
        //  job list too.
        for (let iSrcMsgHdr=0; iSrcMsgHdr < aSrcMsgHdrs.length; iSrcMsgHdr++) {
          let msgHdr = aSrcMsgHdrs.queryElementAt(iSrcMsgHdr, Ci.nsIMsgDBHdr);
          messageKeys.push(msgHdr.messageKey);
          reindexJob.items.push(
            [GlodaDatastore._mapFolderURI(aDestFolder.URI),
             msgHdr.messageId]);
        }
        // quickly move them to the right folder, zeroing their message keys
        GlodaDatastore.updateMessageFoldersByKeyPurging(srcFolder.URI,
                                                        messageKeys,
                                                        aDestFolder.URI);
        // and now let us queue the re-indexings...
        this.indexer._indexQueue.push(reindexJob);
        this.indexer.indexingJobGoal++;
        this.indexer.indexing = true;
      }
      else {
        let copyIndexJob = new IndexingJob("message", 1, null);

        for (let iSrcMsgHdr=0; iSrcMsgHdr < aSrcMsgHdrs.length; iSrcMsgHdr++) {
          let msgHdr = aSrcMsgHdrs.queryElementAt(iSrcMsgHdr, Ci.nsIMsgDBHdr);
          copyIndexJob.items.push([
            GlodaDatastore._mapFolderURI(aDestFolder.URI),
            msgHdr.messageId]);
        }

        this.indexer._indexQueue.push(copyIndexJob);
        this.indexer._indexingJobGoal++;
        this.indexer.indexing = true;
      }
      } catch (ex) { this.indexer._log.error("SAD SAD: " + ex); }
    },
    
    /**
     * Handles folder no-longer-exists-ence.  We want to delete all messages
     *  located in the folder and then kill the URI/id.  To this end we create
     *  two jobs.  One kills all the messages, and one actually deletes the
     *  URI/id.
     */
    folderDeleted: function gloda_indexer_folderDeleted(aFolder) {
      this.indexer._log.debug("folderDeleted notification");
      let folderID = GlodaDatastore._mapFolderURI(aFolder.URI);
      
      let messageJob = new IndexingJob("message", -1, null);
      messageJob.items = GlodaDatastore.getMessageIDsByFolderID(folderID);
      if (messageJob.items.length > 0)
        this.indexer._indexQueue.push(messageJob);
      
      let folderJob = new IndexingJob("folder", -1, folderID);
      this.indexer._indexQueue.push(folderJob);

      this.indexer._indexingJobGoal += 2;
      this.indexer.indexing = true;
    },
    
    /**
     * Handle a folder being copied.  I do not believe the MailNews code is
     *  capable of generating a case where aMove is true, but just in case we'll
     *  dispatch to our sibling method, folderRenamed.
     *
     * Folder copying is conceptually all kinds of annoying (I mean, why would
     *  you really need to duplicate all those messages?) but is easily dealt
     *  with by queueing the destination folder for initial indexing. 
     */
    folderMoveCopyCompleted: function gloda_indexer_folderMoveCopyCompleted(
                               aMove, aSrcFolder, aDestFolder) {
      this.indexer._log.debug("folderMoveCopy notification (Move: " + aMove
                              + ")");
      if (aMove) {
        // TODO handle nested folder ramifications (we don't receive events
        //  for these, so nested folders will become wrong.)
        let srcURI = aSrcFolder.URI;
        let targetURI = aDestFolder.URI +
                        srcURI.substring(srcURI.lastIndexOf("/"));
        this.indexer._log.debug("renaming " + srcURI + " to " + targetURI);
        GlodaDatastore.renameFolder(srcURI, targetURI);
        return;
      }
      this.indexer._indexingFolderGoal++;
      this.indexer._indexQueue.push(["folder", 1,
        GlodaDatastore._mapFolderURI(aDestFolder.URI)]);
      this.indexer.indexing = true;
    },
    
    /**
     * We just need to update the URI <-> ID maps and the row in the database,
     *  all of which is actually done by the datastore for us.
     */
    folderRenamed: function gloda_indexer_folderRenamed(aOrigFolder,
                                                        aNewFolder) {
      // TODO handle nested folder ramifications (we don't receive events for
      //  these, so nested folders will become wrong)
      this.indexer._log.debug("folderRenamed notification: " + aOrigFolder.URI +
                              " to " + aNewFolder.URI);
      GlodaDatastore.renameFolder(aOrigFolder.URI, aNewFolder.URI);
    },
    
    itemEvent: function gloda_indexer_itemEvent(aItem, aEvent, aData) {
      // nop.  this is an expansion method on the part of the interface and has
      //  no known events that we need to handle.
    },
  },
  
  /**
   * A nsIFolderListener (listening on nsIMsgMailSession so we get all of
   *  these events) PRIMARILY to get folder loaded notifications.  Because of
   *  deficiencies in the nsIMsgFolderListener's events at this time, we also
   *  get our folder-added and newsgroup notifications from here for now.  (This
   *  will be rectified.)  
   */
  _folderListener: {
    indexer: null,
    _kFolderLoadedAtom: null,
    
    _init: function gloda_indexer_fl_init(aIndexer) {
      this.indexer = aIndexer;
      let atomService = Cc["@mozilla.org/atom-service;1"].
                        getService(Ci.nsIAtomService);
      this._kFolderLoadedAtom = atomService.getAtom("FolderLoaded");
      // we explicitly know about these things rather than bothering with some
      //  form of registration scheme because these aren't going to change much.
      this._kStatusAtom = atomService.getAtom("Status");
      this._kFlaggedAtom = atomService.getAtom("Flagged");
      this._kJunkStatusChangedAtom = atomService.getAtom("JunkStatusChanged");
    },
    
    /**
     * Helper method to do the leg-work associated with flagging a message
     *  for re-indexing because of some change in meta-state that happened to
     *  it.  Job-wise, we treat this as a message addition; we are uniquely
     *  identifying the message by providing its folder ID and message key, and
     *  the indexer will cleanly map this to the existing gloda message.
     */
    _reindexChangedMessage: function(aMsgHdr) {
      if (this.indexer._pendingAddJob === null) {
        this.indexer._pendingAddJob = new IndexingJob("message", 1, null);
        this.indexer._indexQueue.push(this.indexer._pendingAddJob);
        this.indexer._indexingJobGoal++;
      }
      this.indexer._pendingAddJob.items.push(
        [GlodaDatastore._mapFolderURI(aMsgHdr.folder.URI),
         aMsgHdr.messageKey]);
      this.indexer.indexing = true;
    },
  
    /**
     * Find out when folders are added or new messages show up in a newsgroup.
     */
    OnItemAdded: function gloda_indexer_OnItemAdded(aParentItem, aItem) {
    },
    
    /**
     * Find out when messages disappear from a newsgroup.
     */
    OnItemRemoved: function gloda_indexer_OnItemRemoved(aParentItem, aItem) {
    },
    
    /**
     * Do nothing, we get our header change notifications directly from the
     *  nsMsgDatabase.
     */
    OnItemPropertyChanged: function gloda_indexer_OnItemPropertyChanged(
                             aItem, aProperty, aOldValue, aNewValue) {
    },
    OnItemIntPropertyChanged: function gloda_indexer_OnItemIntPropertyChanged(
                                aItem, aProperty, aOldValue, aNewValue) {
    },
    OnItemBoolPropertyChanged: function gloda_indexer_OnItemBoolPropertyChanged(
                                aItem, aProperty, aOldValue, aNewValue) {
    },
    OnItemUnicharPropertyChanged:
        function gloda_indexer_OnItemUnicharPropertyChanged(
          aItem, aProperty, aOldValue, aNewValue) {
      
    },
    OnItemPropertyFlagChanged: function gloda_indexer_OnItemPropertyFlagChanged(
                                aMsgHdr, aProperty, aOldValue, aNewValue) {
      if (aProperty == this._kStatusAtom ||
          aProperty == this._kFlaggedAtom ||
          aProperty == this._kJunkStatusChangedAtom) {
        this.indexer._log.debug("ItemPropertyFlagChanged notification");
        this._reindexChangedMessage(aMsgHdr);
      }
    },
    
    /**
     * Get folder loaded notifications for folders that had to do some
     *  (asynchronous) processing before they could be opened.
     */
    OnItemEvent: function gloda_indexer_OnItemEvent(aFolder, aEvent) {
      if (aEvent == this._kFolderLoadedAtom)
        this.indexer._onFolderLoaded(aFolder);
    },
  },
  
  /* ***** Rebuilding / Reindexing ***** */
  // TODO: implement a folder observer doodad to handle rebuilding / reindexing
  /**
   * Allow us to invalidate an outstanding folder traversal because the
   *  underlying database is going away.  We use other means for detecting 
   *  modifications of the message (labeling, marked (un)read, starred, etc.)
   *
   * This is an nsIDBChangeListener listening to an nsIDBChangeAnnouncer.  To
   *  add ourselves, we get us a nice nsMsgDatabase, query it to the announcer,
   *  then call AddListener.
   */
  _databaseAnnouncerListener: {
    indexer: null,
    onAnnouncerGoingAway: function gloda_indexer_dbGoingAway(
                                         aDBChangeAnnouncer) {
      this.indexer._indexerLeaveFolder(false);
    },
    
    onHdrFlagsChanged: function(aHdrChanged, aOldFlags, aNewFlags, aInstigator) {},
    onHdrDeleted: function(aHdrChanged, aParentKey, aFlags, aInstigator) {},
    onHdrAdded: function(aHdrChanged, aParentKey, aFlags, aInstigator) {},
    onParentChanged: function(aKeyChanged, aOldParent, aNewParent, 
                              aInstigator) {},
    onReadChanged: function(aInstigator) {},
    onJunkScoreChanged: function(aInstigator) {},
    onHdrPropertyChanged: function (aHdrToChange, aPreChange, aStatus,
                                    aInstigator) {},
  },
  
  /* ***** MailNews Shutdown ***** */
  // TODO: implement a shutdown/pre-shutdown listener that attempts to either
  //  drain the indexing queue or persist it.
  /**
   * Shutdown task.  THIS IS NOT HOOKED UP TO ANYTHING YET.  THIS IS PROBABLY
   *  NOT HOW WE WANT TO HANDLE THINGS EITHER.
   *
   * We implement nsIMsgShutdownTask, served up by nsIMsgShutdownService.  We
   *  offer our services by registering ourselves as a "msg-shutdown" observer
   *  with the observer service.
   */
  _shutdownTask: {
    indexer: null,
    
    get needsToRunTask() {
      return this.indexer.indexing;
    },
    
    /**
     * So we could either go all out finishing our indexing, or write down what
     *  we need to index next time around.  For now, we opt to complete our
     *  indexing since it greatly simplifies our lives, but it probably would
     *  be friendly to simply persist our state.
     *
     * XXX: so we can either return false and be done with it, or return true
     *  and provide the stop running notification.
     * We call aUrlListener's OnStopRunningUrl(null, NS_OK) when we are done,
     *  and can provide status updates by calling the shutdown service
     *  (nsIMsgShutdownService)'s setStatusText method. 
     */
    doShutdownTask: function gloda_indexer_doShutdownTask(aUrlListener,
                                                          aMsgWingow) {
      this.indexer._onStopIndexingUrlListener = aUrlListener;
      
      return true;
    },
    
    getCurrentTaskName: function gloda_indexer_getCurrentTaskName() {
      // if we hook this up, we will probably need to L10n this after all...
      return "Global Database Indexer"; // L10n me
    },
  }, 
  
  /**
   * Attempt to extract the original subject from a message.  For replies, this
   *  means either taking off the 're[#]:' (or variant, including other language
   *  variants), or in a Microsoft specific-ism, from the Thread-Topic header.
   * Since we are using the nsIMsgDBHdr's subject field, this is already done
   *  for us, and we don't actually need to do any extra work.  Hooray!
   */
  _extractOriginalSubject: function glodaIndexExtractOriginalSubject(aMsgHdr) {
    return aMsgHdr.mime2DecodedSubject;
  },
  
  _indexMessage: function gloda_indexMessage(aMsgHdr) {
    this._log.debug("*** Indexing message: " + aMsgHdr.messageKey + " : " +
                    aMsgHdr.subject);
    MsgHdrToMimeMessage(aMsgHdr, this, this._indexMessageWithBody);
    return kWorkAsync;
  },
  
  _indexMessageWithBody: function gloda_index_indexMessageWithBody(
       aMsgHdr, aMimeMsg) {

    // -- Find/create the conversation the message belongs to.
    // Our invariant is that all messages that exist in the database belong to
    //  a conversation.
    
    // - See if any of the ancestors exist and have a conversationID...
    // (references are ordered from old [0] to new [n-1])
    let references = [aMsgHdr.getStringReference(i) for each
                      (i in range(0, aMsgHdr.numReferences))];
    // also see if we already know about the message...
    references.push(aMsgHdr.messageId);
    
    this._datastore.getMessagesByMessageID(references,
      this._indexMessageWithBodyAndAncestors, this,
      [references, aMsgHdr, aMimeMsg]);
    
    return kWorkAsync;
  },
  
  _indexMessageWithBodyAndAncestors:
    function gloda_index_indexMessageWithBodyAndAncestors(ancestorLists,
      references, aMsgHdr, aMimeMsg) {
    // (ancestorLists has a direct correspondence to the message ids)
    
    // pull our current message lookup results off
    references.pop();
    let candidateCurMsgs = ancestorLists.pop();
    
    let conversationID = null;
    // -- figure out the conversation ID
    // if we have a clone/already exist, just use his conversation ID
    if (candidateCurMsgs.length > 0) {
      conversationID = candidateCurMsgs[0].conversationID;
    }
    // otherwise check out our ancestors
    else {
      // (walk from closest to furthest ancestor)
      for (let iAncestor=ancestorLists.length-1; iAncestor >= 0; --iAncestor) {
        let ancestorList = ancestorLists[iAncestor];
        
        if (ancestorList.length > 0) {
          // we only care about the first instance of the message because we are
          //  able to guarantee the invariant that all messages with the same
          //  message id belong to the same conversation. 
          let ancestor = ancestorList[0];
          if (conversationID === null)
            conversationID = ancestor.conversationID;
          else if (conversationID != ancestor.conversationID)
            this._log.error("Inconsistency in conversations invariant on " +
                            ancestor.messageID + ".  It has conv id " +
                            ancestor.conversationID + " but expected " + 
                            conversationID);
        }
      }
    }
    
    let conversation = null;
    // nobody had one?  create a new conversation
    if (conversationID === null) {
      // (the create method could issue the id, making the call return
      //  without waiting for the database...)
      conversation = this._datastore.createConversation(
          this._extractOriginalSubject(aMsgHdr), null, null);
      conversationID = conversation.id;
    }
    
    // Walk from furthest to closest ancestor, creating the ancestors that don't
    //  exist. (This is possible if previous messages that were consumed in this
    //  thread only had an in-reply-to or for some reason did not otherwise
    //  provide the full references chain.)
    for (let iAncestor=0; iAncestor < ancestorLists.length; ++iAncestor) {
      let ancestorList = ancestorLists[iAncestor];
      
      if (ancestorList.length == 0) {
        this._log.debug("creating message with: null, " + conversationID +
                        ", " + references[iAncestor] +
                        ", null.");
        let ancestor = this._datastore.createMessage(null, null, // ghost
                                                     conversationID, null,
                                                     references[iAncestor],
                                                     null); // no body
        ancestorLists[iAncestor].push(ancestor);
      }
    }
    // now all our ancestors exist, though they may be ghost-like...
    
    // find if there's a ghost version of our message or we already have indexed
    //  this message.
    let curMsg = null;
    this._log.debug(candidateCurMsgs.length + " candidate messages");
    for (let iCurCand=0; iCurCand < candidateCurMsgs.length; iCurCand++) {
      let candMsg = candidateCurMsgs[iCurCand];

      this._log.debug("candidate folderID: " + candMsg.folderID +
                      " messageKey: " + candMsg.messageKey);
      
      // if we are in the same folder and we have the same message key, we
      //  are definitely the same, stop looking.
      // if we are in the same folder and the candidate message has a null
      //  message key, we treat it as our best option unless we find an exact
      //  key match. (this would happen because the 'move' notification case
      //  has to deal with not knowing the target message key.  this case
      //  will hopefully be somewhat improved in the future to not go through
      //  this path which mandates re-indexing of the message in its entirety.)
      // if we are in the same folder and the candidate message's underlying
      //  message no longer exists/matches, we'll assume we are the same but
      //  were betrayed by a re-indexing or something, but we have to make sure
      //  a perfect match doesn't turn up.
      if (candMsg.folderURI == aMsgHdr.folder.URI) {
        if ((candMsg.messageKey == aMsgHdr.messageKey) || 
            (candMsg.messageKey === null)) {
          curMsg = candMsg;
          break;
        }
        if (candMsg.messageKey === null)
          curMsg = candMsg;
        else if ((curMsg === null) && (candMsg.folderMessage === null))
          curMsg = candMsg;
      }
      // our choice of last resort, but still okay, is a ghost message
      else if ((curMsg === null) && (candMsg.folderID === null)) {
        curMsg = candMsg;
      }
    }
    
    let isNew;
    if (curMsg === null) {
      this._log.debug("...creating new message.  body length: " +
                      (aMimeMsg ? aMimeMsg.body.length : null));
      curMsg = this._datastore.createMessage(aMsgHdr.folder.URI,
                                             aMsgHdr.messageKey,                
                                             conversationID,
                                             aMsgHdr.date,
                                             aMsgHdr.messageId,
                                             aMimeMsg ?
                                             aMimeMsg.body : null); // no snippet
      isNew = true;
    }
    else {
      isNew = (curMsg._folderID === null); // aka was-a-ghost
      // (messageKey can be null if it's not new in the move-case)
      curMsg._folderID = this._datastore._mapFolderURI(aMsgHdr.folder.URI);
      curMsg._messageKey = aMsgHdr.messageKey;
      curMsg.date = new Date(aMsgHdr.date / 1000); 
      // note: we are assuming that our matching logic is flawless in that
      //  if this message was not a ghost, we are assuming the 'body'
      //  associated with the id is still exactly the same.  It is conceivable
      //  that there are cases where this is not true.
      this._log.debug("Updating message.  Providing body: " +
                      (isNew && aMimeMsg) + " body length: " +
                      (aMimeMsg ? aMimeMsg.body.length : null));
      this._datastore.updateMessage(curMsg, (isNew && aMimeMsg) ?
                                    aMimeMsg.body : null);
    }
    
    // TODO: provide the parent gloda message if we can conjure it up.
    Gloda.processMessage(curMsg, aMsgHdr, aMimeMsg, isNew,
                         /* parent gloda message */ null);
     
    this.callbackDriver();
  },
  
  /**
   * Wipe a message out of existence from our index.  This is slightly more
   *  tricky than one would first expect because there are potentially
   *  attributes not immediately associated with this message that reference
   *  the message.  Not only that, but deletion of messages may leave a
   *  conversation posessing only ghost messages, which we don't want, so we
   *  need to nuke the moot conversation and its moot ghost messages.
   * For now, we are actually punting on that trickiness, and the exact
   *  nuances aren't defined yet because we have not decided whether to store
   *  such attributes redundantly.  For example, if we have subject-pred-object,
   *  we could actually store this as attributes (subject, id, object) and
   *  (object, id, subject).  In such a case, we could query on (subject, *)
   *  and use the results to delete the (object, id, subject) case.  If we
   *  don't redundantly store attributes, we can deal with the problem by
   *  collecting up all the attributes that accept a message as their object
   *  type and issuing a delete against that.  For example, delete (*, [1,2,3],
   *  message id).
   * (We are punting because we haven't implemented support for generating
   *  attributes like that yet.)
   *
   * @TODO: implement deletion of attributes that reference (deleted) messages
   */
  _deleteMessage: function gloda_index_deleteMessage(aMessage) {
    // -- delete our attributes
    // delete the message's attributes (if we implement the cascade delete, that
    //  could do the honors for us... right now we define the trigger in our
    //  schema but the back-end ignores it)
    aMessage._datastore.clearMessageAttributes(aMessage);
    
    // -- delete our message or ghost us, and maybe nuke the whole conversation
    // look at the other messages in the conversation.
    let conversationMsgs = aMessage._datastore.getMessagesByConversationID(
                             aMessage.conversationID, true);
    let ghosts = [];
    let twinMessage = null;
    for (let iMsg=0; iMsg < conversationMsgs.length; iMsg++) {
      let convMsg = conversationMsgs[iMsg];
      
      // ignore our message
      if (convMsg.id == aMessage.id)
        continue;
      
      if (convMsg.folderID !== null) {
        if (convMsg.headerMessageID == aMessage.headerMessageID) {
          twinMessage = convMsg;
        }
      }
      else {
        ghosts.push(convMsg);
      }
    }
    
    // is everyone else a ghost? (note that conversationMsgs includes us, but
    //  ghosts cannot)
    if ((conversationMsgs.length - 1) == ghosts.length) {
      // obliterate the conversation including aMessage.
      // since everyone else is a ghost they have no attributes.  however, the
      //  conversation may some day have attributes targeted against it, so it
      //  gets a helper.
      this._deleteConversationOfMessage(aMessage);
      aMessage._nuke();
    }
    else { // there is at least one real message out there, so the only q is...
      // do we have a twin (so it's okay to delete us) or do we become a ghost?
      if (twinMessage !== null) { // just delete us
        aMessage._datastore.deleteMessageByID(aMessage.id);
        aMessage._nuke();
      }
      else { // ghost us
        aMessage._ghost();
        aMessage._datastore.updateMessage(aMessage);
      }
    }
  },
  
  /**
   * Delete an entire conversation, using the passed-in message which must be
   *  the last non-ghost in the conversation and have its attributes all
   *  deleted.  This function issues the batch delete of all the ghosts (and the
   *  message), and in the future will take care to nuke any attributes
   *  referencing the conversation.
   */
  _deleteConversationOfMessage:
      function gloda_index_deleteConversationOfMessage(aMessage) {
    aMessage._datastore.deleteMessagesByConversationID(aMessage.conversationID);
    aMessage._datastore.deleteConversationByID(aMessage.conversationID);
  },
};
GlodaIndexer._init();
