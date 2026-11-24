             
                 
           
                  
                  
                      
                       
                          
                         
import createStrategy from './strategy.js'
                                           
import {noOp} from './utils.js'

const defaultSteadyAnnounceIntervalMs = 60_000

const makeTopicContext =  
                                 
                                                                              
 (
  context                          ,
  kind       ,
  rootTopic        ,
  selfTopic        
    
             
               
                
                   
                   
                
) => ({
  kind,
  appId: context.appId,
  roomId: context.roomId,
  rootTopic,
  selfTopic,
  peerId: context.peerId
})

export default                                                          ({
  defaultConfig,
  steadyAnnounceIntervalMs = defaultSteadyAnnounceIntervalMs,
  reannounceOnDisconnect = true,
  init,
  subscribeTopic,
  publishTopic
}                                       )                    =>
  createStrategy                 ({
    ...(defaultConfig === undefined ? {} : {defaultConfig}),
    init,

    subscribe: async (
      relay,
      rootTopic,
      selfTopic,
      onMessage,
      _getOffers,
      context
    ) => {
      let closed = false

      const signalPeer = (peerTopic        , signal        )       => {
        if (closed) {
          return
        }
        try {
          void Promise.resolve(
            publishTopic(
              relay,
              peerTopic,
              signal,
              makeTopicContext(context, 'signal', rootTopic, selfTopic)
            )
          ).catch(noOp)
        } catch {
          // Ignore synchronous publish failures during fire-and-forget signaling
        }
      }

      const forwardMessage = (topic        , msg                 ) => {
        if (!closed) {
          return onMessage(topic, msg, signalPeer)
        }
      }

      const selfCleanup = await subscribeTopic(
        relay,
        selfTopic,
        forwardMessage,
        makeTopicContext(context, 'self', rootTopic, selfTopic)
      )

      let rootCleanup            
      try {
        rootCleanup = await subscribeTopic(
          relay,
          rootTopic,
          forwardMessage,
          makeTopicContext(context, 'root', rootTopic, selfTopic)
        )
      } catch (err) {
        closed = true
        selfCleanup()
        throw err
      }

      return () => {
        if (closed) {
          return
        }
        closed = true
        selfCleanup()
        rootCleanup()
      }
    },

    announce: async (relay, rootTopic, selfTopic, context) => {
      const result = await publishTopic(
        relay,
        rootTopic,
        {
          peerId: context.peerId
        },
        makeTopicContext(context, 'announce', rootTopic, selfTopic)
      )

      if (typeof result === 'number') {
        return result
      }

      if (typeof result === 'object' && result !== null) {
        if ('stopAnnouncing' in result) {
          return result
        }

        return {
          nextAnnounceMs: result.nextAnnounceMs ?? steadyAnnounceIntervalMs,
          reannounceOnDisconnect:
            result.reannounceOnDisconnect ?? reannounceOnDisconnect
        }
      }

      return {
        nextAnnounceMs: steadyAnnounceIntervalMs,
        reannounceOnDisconnect
      }
    }
  })
